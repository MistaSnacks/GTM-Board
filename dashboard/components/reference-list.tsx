"use client";

import { useState, useTransition } from "react";
import {
  addReferenceAction,
  updateReferenceAction,
  deleteReferenceAction,
} from "@/app/actions";
import { validateReferenceUrl } from "@/lib/references";
import type { CardReference } from "@/lib/types";

interface ReferenceListProps {
  project: string;
  cardSlug: string;
  initialReferences: CardReference[];
}

export default function ReferenceList({ project, cardSlug, initialReferences }: ReferenceListProps) {
  const [refs, setRefs] = useState<CardReference[]>(initialReferences);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleAdd = async () => {
    setError(null);
    const title = newTitle.trim();
    const url = newUrl.trim();
    if (!title || !url) {
      setError("Title and URL are required");
      return;
    }
    if (!validateReferenceUrl(url)) {
      setError("URL must start with http(s)://, mailto:, or /");
      return;
    }
    const created = await addReferenceAction(project, cardSlug, title, url);
    setRefs((prev) => [...prev, created]);
    setNewTitle("");
    setNewUrl("");
  };

  const handleUpdate = (id: string, patch: Partial<Pick<CardReference, "title" | "url">>) => {
    setRefs((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    startTransition(() => {
      updateReferenceAction(project, cardSlug, id, patch);
    });
  };

  const handleDelete = (id: string) => {
    setRefs((prev) => prev.filter((r) => r.id !== id));
    startTransition(() => {
      deleteReferenceAction(project, cardSlug, id);
    });
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "8px",
  };

  return (
    <div style={{ marginTop: "16px" }}>
      <div style={labelStyle}>Reference Docs</div>

      {refs.map((ref) => (
        <div
          key={ref.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 8px",
            marginBottom: "4px",
            background: "var(--bg-card-raised)",
            borderRadius: "6px",
          }}
        >
          <input
            type="text"
            value={ref.title}
            onChange={(e) => setRefs((prev) => prev.map((r) => (r.id === ref.id ? { ...r, title: e.target.value } : r)))}
            onBlur={(e) => handleUpdate(ref.id, { title: e.target.value })}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontFamily: "var(--font-inter)",
              fontSize: "13px",
            }}
          />
          <a
            href={ref.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--mint)",
              textDecoration: "underline",
              maxWidth: "180px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={ref.url}
          >
            {ref.url}
          </a>
          <button
            onClick={() => {
              const next = prompt("Update URL", ref.url);
              if (next && validateReferenceUrl(next)) {
                handleUpdate(ref.id, { url: next });
              } else if (next) {
                alert("Invalid URL");
              }
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "12px",
            }}
            aria-label="Edit URL"
          >
            ✎
          </button>
          <button
            onClick={() => handleDelete(ref.id)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "14px",
            }}
            aria-label="Delete reference"
          >
            ×
          </button>
        </div>
      ))}

      {/* Add new reference */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={newTitle}
            placeholder="Title (e.g., Brand voice doc)"
            onChange={(e) => setNewTitle(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 8px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-inter)",
              fontSize: "13px",
            }}
          />
          <input
            type="text"
            value={newUrl}
            placeholder="https://… or /docs/file.md"
            onChange={(e) => setNewUrl(e.target.value)}
            style={{
              flex: 2,
              padding: "6px 8px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
            }}
          />
          <button
            onClick={handleAdd}
            className="pill pill-olive"
          >
            ADD
          </button>
        </div>
        {error && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--red)" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
