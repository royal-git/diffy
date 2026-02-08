import React, { memo, useMemo } from 'react';

interface MarkdownPreviewProps {
  left: string | null;
  right: string | null;
}

interface ImageSide {
  src: string;
  path: string;
}

interface ImagePreviewProps {
  left: ImageSide | null;
  right: ImageSide | null;
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre className="preview-md-code" key={`n-${key++}`}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (!line.trim()) {
      nodes.push(<div className="preview-md-spacer" key={`n-${key++}`} />);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length);
      const textValue = heading[2].trim();
      const className = `preview-md-h${level}`;
      nodes.push(
        <div className={className} key={`n-${key++}`}>
          {textValue}
        </div>
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      nodes.push(
        <div className="preview-md-li" key={`n-${key++}`}>
          <span className="preview-md-bullet">•</span>
          <span>{bullet[1]}</span>
        </div>
      );
      continue;
    }

    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      nodes.push(
        <div className="preview-md-li" key={`n-${key++}`}>
          <span className="preview-md-bullet">1.</span>
          <span>{numbered[1]}</span>
        </div>
      );
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      nodes.push(
        <blockquote className="preview-md-quote" key={`n-${key++}`}>
          {quote[1]}
        </blockquote>
      );
      continue;
    }

    nodes.push(
      <p className="preview-md-p" key={`n-${key++}`}>
        {line}
      </p>
    );
  }

  return nodes;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = memo(({ left, right }) => {
  const leftNodes = useMemo(() => (left ? renderMarkdown(left) : null), [left]);
  const rightNodes = useMemo(() => (right ? renderMarkdown(right) : null), [right]);

  return (
    <div className="file-preview-grid">
      <section className="file-preview-pane">
        <header className="file-preview-pane-header">Base</header>
        <div className="file-preview-markdown">{leftNodes ?? <p className="file-preview-empty">No base content</p>}</div>
      </section>
      <section className="file-preview-pane">
        <header className="file-preview-pane-header">Head</header>
        <div className="file-preview-markdown">{rightNodes ?? <p className="file-preview-empty">No head content</p>}</div>
      </section>
    </div>
  );
});

MarkdownPreview.displayName = 'MarkdownPreview';

export const ImagePreview: React.FC<ImagePreviewProps> = memo(({ left, right }) => {
  return (
    <div className="file-preview-grid">
      <section className="file-preview-pane">
        <header className="file-preview-pane-header">Base</header>
        <div className="file-preview-image-wrap">
          {left ? <img className="file-preview-image" src={left.src} alt={left.path} /> : <p className="file-preview-empty">No base image</p>}
        </div>
      </section>
      <section className="file-preview-pane">
        <header className="file-preview-pane-header">Head</header>
        <div className="file-preview-image-wrap">
          {right ? <img className="file-preview-image" src={right.src} alt={right.path} /> : <p className="file-preview-empty">No head image</p>}
        </div>
      </section>
    </div>
  );
});

ImagePreview.displayName = 'ImagePreview';
