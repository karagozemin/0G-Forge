type DiffLine = {
  kind: "context" | "add" | "remove";
  content: string;
};

function splitLines(value: string): string[] {
  if (value.length === 0) {
    return [];
  }

  return value.replace(/\r\n/g, "\n").split("\n");
}

function formatHeader(pathname: string, kind: "old" | "new", isEmpty: boolean): string {
  if (isEmpty) {
    return kind === "old" ? "--- /dev/null" : "+++ /dev/null";
  }

  return kind === "old" ? `--- a/${pathname}` : `+++ b/${pathname}`;
}

export function createUnifiedDiff(pathname: string, oldContent: string, newContent: string): string {
  if (oldContent === newContent) {
    return "";
  }

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  const diffLines: DiffLine[] = [];

  if (oldLines.length > 0) {
    for (const line of oldLines) {
      diffLines.push({ kind: "remove", content: line });
    }
  }

  if (newLines.length > 0) {
    for (const line of newLines) {
      diffLines.push({ kind: "add", content: line });
    }
  }

  const oldRange = oldLines.length === 0 ? "0,0" : `1,${oldLines.length}`;
  const newRange = newLines.length === 0 ? "0,0" : `1,${newLines.length}`;

  const lines = [
    formatHeader(pathname, "old", oldLines.length === 0),
    formatHeader(pathname, "new", newLines.length === 0),
    `@@ -${oldRange} +${newRange} @@`,
    ...diffLines.map((line) => {
      if (line.kind === "add") {
        return `+${line.content}`;
      }

      if (line.kind === "remove") {
        return `-${line.content}`;
      }

      return ` ${line.content}`;
    })
  ];

  return `${lines.join("\n")}\n`;
}
