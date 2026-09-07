"use client";

import React from "react";

/**
 * Minimal markdown renderer (PBI-025): headings, bold, code spans,
 * unordered lists, paragraphs. No dependency by design — anything
 * fancier (tables, nesting, links) is out of MVP scope.
 */
export default function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (list) {
      const items = list;
      list = null;
      blocks.push(
        <ul key={blocks.length} className="my-2 list-disc pl-6">
          {items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("### ")) {
      flush();
      blocks.push(
        <h3 key={blocks.length} className="mt-3 text-lg font-semibold">
          {inline(line.slice(4))}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push(
        <h2 key={blocks.length} className="mt-4 text-xl font-semibold">
          {inline(line.slice(3))}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      flush();
      blocks.push(
        <h1 key={blocks.length} className="mt-4 text-2xl font-semibold">
          {inline(line.slice(2))}
        </h1>,
      );
    } else if (line.startsWith("- ")) {
      (list ??= []).push(line.slice(2));
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      blocks.push(
        <p key={blocks.length} className="my-2">
          {inline(line)}
        </p>,
      );
    }
  }
  flush();
  return <>{blocks}</>;
}

function inline(text: string): React.ReactNode {
  // Splits **bold** and `code`, leaving the rest as text.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded bg-zinc-100 px-1 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
