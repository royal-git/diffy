import React, { memo, useMemo } from 'react';
import type { FileDiff } from '../types';

interface Props {
  files: FileDiff[];
  activeIndex: number;
  onSelectFile: (index: number) => void;
  chunkDecisions: Record<string, string>;
}

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  fileIndex?: number;
  fileDiff?: FileDiff;
  children: TreeNode[];
}

export const FileTree: React.FC<Props> = memo(({ files, activeIndex, onSelectFile, chunkDecisions }) => {
  const tree = useMemo(() => buildTree(files), [files]);

  const stats = useMemo(() => {
    let totalAdded = 0;
    let totalRemoved = 0;
    let totalChunks = 0;
    let decidedChunks = 0;

    for (const file of files) {
      totalAdded += file.additions;
      totalRemoved += file.deletions;
      for (const chunk of file.chunks) {
        totalChunks++;
        if (chunkDecisions[chunk.id] && chunkDecisions[chunk.id] !== 'pending') {
          decidedChunks++;
        }
      }
    }

    return { totalAdded, totalRemoved, totalChunks, decidedChunks };
  }, [files, chunkDecisions]);

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title">Files</span>
        <span className="file-tree-count">{files.length}</span>
      </div>

      <div className="file-tree-stats">
        <span className="stat-added">+{stats.totalAdded}</span>
        <span className="stat-removed">-{stats.totalRemoved}</span>
        {stats.totalChunks > 0 && (
          <span className="stat-progress">
            {stats.decidedChunks}/{stats.totalChunks} reviewed
          </span>
        )}
      </div>

      <div className="file-tree-list">
        {tree.map(node => (
          <TreeNodeComponent
            key={node.path}
            node={node}
            activeIndex={activeIndex}
            onSelectFile={onSelectFile}
            depth={0}
            chunkDecisions={chunkDecisions}
          />
        ))}
      </div>

      <div className="file-tree-shortcuts">
        <div className="shortcut"><kbd>[</kbd> <kbd>]</kbd> navigate files</div>
        <div className="shortcut"><kbd>n</kbd> <kbd>N</kbd> next/prev change</div>
        <div className="shortcut"><kbd>a</kbd> accept <kbd>x</kbd> reject</div>
        <div className="shortcut"><kbd>v</kbd> toggle view</div>
        <div className="shortcut"><kbd>b</kbd> toggle sidebar</div>
      </div>
    </div>
  );
});

FileTree.displayName = 'FileTree';

// ── Tree node ────────────────────────────────────────────────────

interface TreeNodeProps {
  node: TreeNode;
  activeIndex: number;
  onSelectFile: (index: number) => void;
  depth: number;
  chunkDecisions: Record<string, string>;
}

const TreeNodeComponent: React.FC<TreeNodeProps> = memo(({
  node,
  activeIndex,
  onSelectFile,
  depth,
  chunkDecisions,
}) => {
  if (node.isFile) {
    const isActive = node.fileIndex === activeIndex;
    const diff = node.fileDiff!;
    const allDecided = diff.chunks.every(
      c => chunkDecisions[c.id] && chunkDecisions[c.id] !== 'pending'
    );

    return (
      <button
        className={`tree-file ${isActive ? 'active' : ''} ${allDecided ? 'fully-reviewed' : ''}`}
        onClick={() => onSelectFile(node.fileIndex!)}
        style={{ paddingLeft: depth * 16 + 8 }}
        title={node.path}
      >
        <span className={`file-icon ${diff.type}`}>
          {diff.type === 'added' ? 'A' : diff.type === 'deleted' ? 'D' : diff.type === 'renamed' ? 'R' : 'M'}
        </span>
        <span className="file-name">{node.name}</span>
        <span className="file-stats">
          {diff.additions > 0 && <span className="stat-added">+{diff.additions}</span>}
          {diff.deletions > 0 && <span className="stat-removed">-{diff.deletions}</span>}
        </span>
        {allDecided && <span className="review-check">&#x2713;</span>}
      </button>
    );
  }

  return (
    <div className="tree-folder">
      <div className="folder-name" style={{ paddingLeft: depth * 16 + 8 }}>
        <span className="folder-icon">&#x25BE;</span>
        {node.name}
      </div>
      {node.children.map(child => (
        <TreeNodeComponent
          key={child.path}
          node={child}
          activeIndex={activeIndex}
          onSelectFile={onSelectFile}
          depth={depth + 1}
          chunkDecisions={chunkDecisions}
        />
      ))}
    </div>
  );
});

TreeNodeComponent.displayName = 'TreeNodeComponent';

// ── Build tree structure from flat file list ─────────────────────

function buildTree(files: FileDiff[]): TreeNode[] {
  // If there's only 1 file or files are in the same directory, flatten
  if (files.length <= 1) {
    return files.map((f, i) => ({
      name: f.newPath.split('/').pop() || f.newPath,
      path: f.newPath,
      isFile: true,
      fileIndex: i,
      fileDiff: f,
      children: [],
    }));
  }

  const root: TreeNode = { name: '', path: '', isFile: false, children: [] };

  for (let i = 0; i < files.length; i++) {
    const parts = files[i].newPath.split('/');
    let current = root;

    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      const isLast = j === parts.length - 1;
      const existingChild = current.children.find(c => c.name === part);

      if (isLast) {
        current.children.push({
          name: part,
          path: files[i].newPath,
          isFile: true,
          fileIndex: i,
          fileDiff: files[i],
          children: [],
        });
      } else if (existingChild && !existingChild.isFile) {
        current = existingChild;
      } else {
        const newDir: TreeNode = {
          name: part,
          path: parts.slice(0, j + 1).join('/'),
          isFile: false,
          children: [],
        };
        current.children.push(newDir);
        current = newDir;
      }
    }
  }

  // Collapse single-child directories
  return collapseTree(root.children);
}

function collapseTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map(node => {
    if (!node.isFile && node.children.length === 1 && !node.children[0].isFile) {
      const child = node.children[0];
      return {
        ...child,
        name: `${node.name}/${child.name}`,
        children: collapseTree(child.children),
      };
    }
    if (!node.isFile) {
      return { ...node, children: collapseTree(node.children) };
    }
    return node;
  });
}
