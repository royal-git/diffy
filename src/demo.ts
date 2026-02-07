export const DEMO_DIFF = `diff --git a/src/auth/login.ts b/src/auth/login.ts
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,42 +1,58 @@
-import { Request, Response } from 'express';
-import bcrypt from 'bcrypt';
-import jwt from 'jsonwebtoken';
-import { db } from '../database';
+import { Request, Response, NextFunction } from 'express';
+import bcrypt from 'bcryptjs';
+import jwt from 'jsonwebtoken';
+import { db } from '../database';
+import { LoginSchema } from '../validation/schemas';
+import { AppError } from '../errors';
+import { logger } from '../logger';

-const SECRET = 'mysecret123';
+const JWT_SECRET = process.env.JWT_SECRET;
+const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
+
+if (!JWT_SECRET) {
+  throw new Error('JWT_SECRET environment variable is required');
+}

-export async function login(req: Request, res: Response) {
-  const { email, password } = req.body;
+export async function login(req: Request, res: Response, next: NextFunction) {
+  try {
+    const { email, password } = LoginSchema.parse(req.body);

-  if (!email || !password) {
-    return res.status(400).json({ error: 'Missing fields' });
-  }
+    const user = await db.user.findUnique({
+      where: { email: email.toLowerCase().trim() },
+      select: {
+        id: true,
+        email: true,
+        passwordHash: true,
+        role: true,
+        isActive: true,
+      },
+    });

-  const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);
+    if (!user || !user.isActive) {
+      throw new AppError(401, 'Invalid email or password');
+    }

-  if (user.rows.length === 0) {
-    return res.status(401).json({ error: 'User not found' });
-  }
+    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
+    if (!isValidPassword) {
+      logger.warn('Failed login attempt', { email, ip: req.ip });
+      throw new AppError(401, 'Invalid email or password');
+    }

-  const valid = await bcrypt.compare(password, user.rows[0].password);
+    const token = jwt.sign(
+      { userId: user.id, email: user.email, role: user.role },
+      JWT_SECRET,
+      { expiresIn: JWT_EXPIRES_IN }
+    );

-  if (!valid) {
-    return res.status(401).json({ error: 'Wrong password' });
-  }
+    const refreshToken = jwt.sign(
+      { userId: user.id, type: 'refresh' },
+      JWT_SECRET,
+      { expiresIn: '7d' }
+    );

-  const token = jwt.sign({ id: user.rows[0].id }, SECRET, { expiresIn: '1h' });
+    logger.info('Successful login', { userId: user.id, email });

-  res.json({ token });
+    res.json({
+      token,
+      refreshToken,
+      user: { id: user.id, email: user.email, role: user.role },
+    });
+  } catch (error) {
+    next(error);
+  }
 }
diff --git a/src/components/UserProfile.tsx b/src/components/UserProfile.tsx
--- a/src/components/UserProfile.tsx
+++ b/src/components/UserProfile.tsx
@@ -1,35 +1,62 @@
-import React, { useState, useEffect } from 'react';
+import React, { useState, useEffect, useCallback } from 'react';
+import { useParams, useNavigate } from 'react-router-dom';
+import { LoadingSpinner } from './LoadingSpinner';
+import { ErrorBoundary } from './ErrorBoundary';
+import { useToast } from '../hooks/useToast';

 interface User {
   id: string;
   name: string;
   email: string;
+  avatar?: string;
+  bio?: string;
+  joinedAt: string;
 }

-export function UserProfile({ userId }: { userId: string }) {
+interface Props {
+  userId?: string;
+}
+
+export function UserProfile({ userId: propUserId }: Props) {
+  const { id: paramUserId } = useParams<{ id: string }>();
+  const navigate = useNavigate();
+  const { showToast } = useToast();
+  const userId = propUserId || paramUserId;
+
   const [user, setUser] = useState<User | null>(null);
-  const [loading, setLoading] = useState(true);
+  const [isLoading, setIsLoading] = useState(true);
+  const [error, setError] = useState<string | null>(null);

-  useEffect(() => {
-    fetch(\`/api/users/\${userId}\`)
-      .then(r => r.json())
-      .then(data => {
-        setUser(data);
-        setLoading(false);
-      });
-  }, [userId]);
+  const fetchUser = useCallback(async () => {
+    if (!userId) return;
+    setIsLoading(true);
+    setError(null);
+    try {
+      const response = await fetch(\`/api/users/\${userId}\`);
+      if (!response.ok) throw new Error(\`Failed to load user: \${response.status}\`);
+      const data = await response.json();
+      setUser(data);
+    } catch (err) {
+      setError(err instanceof Error ? err.message : 'Unknown error');
+      showToast({ type: 'error', message: 'Failed to load user profile' });
+    } finally {
+      setIsLoading(false);
+    }
+  }, [userId, showToast]);

-  if (loading) return <div>Loading...</div>;
-  if (!user) return <div>User not found</div>;
+  useEffect(() => { fetchUser(); }, [fetchUser]);
+
+  if (isLoading) return <LoadingSpinner />;
+  if (error) return <div className="error-state">{error}<button onClick={fetchUser}>Retry</button></div>;
+  if (!user) return <div className="empty-state">User not found<button onClick={() => navigate('/')}>Go home</button></div>;

   return (
-    <div>
-      <h1>{user.name}</h1>
-      <p>{user.email}</p>
-    </div>
+    <ErrorBoundary>
+      <div className="user-profile">
+        <div className="profile-header">
+          {user.avatar && <img src={user.avatar} alt={user.name} className="avatar" />}
+          <h1>{user.name}</h1>
+          <p className="email">{user.email}</p>
+          {user.bio && <p className="bio">{user.bio}</p>}
+          <time className="joined">Joined {new Date(user.joinedAt).toLocaleDateString()}</time>
+        </div>
+      </div>
+    </ErrorBoundary>
   );
 }
diff --git a/src/utils/format.ts b/src/utils/format.ts
--- a/src/utils/format.ts
+++ b/src/utils/format.ts
@@ -1,12 +1,28 @@
-export function formatDate(date: Date): string {
-  return date.toLocaleDateString();
+import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
+
+export function formatDate(date: Date | string): string {
+  const d = typeof date === 'string' ? new Date(date) : date;
+
+  if (isToday(d)) return \`Today at \${format(d, 'HH:mm')}\`;
+  if (isYesterday(d)) return \`Yesterday at \${format(d, 'HH:mm')}\`;
+
+  return format(d, 'MMM d, yyyy');
 }

-export function formatCurrency(amount: number): string {
-  return '$' + amount.toFixed(2);
+export function formatRelative(date: Date | string): string {
+  const d = typeof date === 'string' ? new Date(date) : date;
+  return formatDistanceToNow(d, { addSuffix: true });
 }

-export function truncate(str: string, len: number): string {
-  if (str.length <= len) return str;
-  return str.slice(0, len) + '...';
+export function formatCurrency(amount: number, currency = 'USD'): string {
+  return new Intl.NumberFormat('en-US', {
+    style: 'currency',
+    currency,
+    minimumFractionDigits: 2,
+  }).format(amount);
+}
+
+export function truncate(str: string, maxLength: number, suffix = '...'): string {
+  if (str.length <= maxLength) return str;
+  const truncLength = maxLength - suffix.length;
+  if (truncLength <= 0) return suffix.slice(0, maxLength);
+  return str.slice(0, truncLength) + suffix;
 }
`;
