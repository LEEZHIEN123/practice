import { Text, type TextProps } from "react-native";

type Segment = { kind: "text" | "bold"; value: string };

function parseInlineSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;

  while (i < line.length) {
    if (line.startsWith("**", i)) {
      const end = line.indexOf("**", i + 2);
      if (end !== -1) {
        segments.push({ kind: "bold", value: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (line.startsWith("__", i)) {
      const end = line.indexOf("__", i + 2);
      if (end !== -1) {
        segments.push({ kind: "bold", value: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (line[i] === "*" && line[i + 1] !== "*") {
      const end = line.indexOf("*", i + 1);
      if (end !== -1 && line[end + 1] !== "*") {
        segments.push({ kind: "bold", value: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (line[i] === "_" && line[i + 1] !== "_") {
      const end = line.indexOf("_", i + 1);
      if (end !== -1 && line[end + 1] !== "_") {
        segments.push({ kind: "bold", value: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    let next = line.length;
    for (const marker of ["**", "__", "*", "_"]) {
      const idx = line.indexOf(marker, i);
      if (idx !== -1 && idx < next) next = idx;
    }

    if (next === i) {
      segments.push({ kind: "text", value: line[i] });
      i += 1;
    } else {
      segments.push({ kind: "text", value: line.slice(i, next) });
      i = next;
    }
  }

  return segments;
}

function formatLine(line: string): string {
  const bulletMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  if (bulletMatch) return `• ${bulletMatch[3]}`;
  return line;
}

type ChatFormattedTextProps = TextProps & {
  text: string;
  className?: string;
  boldClassName?: string;
};

/** Renders simple markdown: **bold**, __bold__, *bold*, _bold_, bullets, and line breaks. */
export function ChatFormattedText({
  text,
  className = "text-base leading-6 text-left",
  boldClassName = "font-extrabold",
  style,
  ...textProps
}: ChatFormattedTextProps) {
  const lines = text.split("\n");

  return (
    <Text className={className} style={[{ flexShrink: 1 }, style]} {...textProps}>
      {lines.map((line, lineIndex) => {
        const segments = parseInlineSegments(formatLine(line));
        return (
          <Text key={`line-${lineIndex}`}>
            {segments.map((segment, segmentIndex) =>
              segment.kind === "bold" ? (
                <Text key={`s-${lineIndex}-${segmentIndex}`} className={boldClassName}>
                  {segment.value}
                </Text>
              ) : (
                <Text key={`s-${lineIndex}-${segmentIndex}`}>{segment.value}</Text>
              )
            )}
            {lineIndex < lines.length - 1 ? "\n" : null}
          </Text>
        );
      })}
    </Text>
  );
}
