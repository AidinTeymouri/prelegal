import { Document, Font, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CoverPage } from "@/lib/cover";
import type { Inline } from "@/lib/inline";
import { clauseLabel, type TermsBlock } from "@/lib/terms";

// Legal text reads better without words broken across lines.
Font.registerHyphenationCallback((word) => [word]);

// Noto Serif (public/fonts, SIL OFL 1.1) covers Latin, Greek and Cyrillic, unlike
// the built-in PDF fonts. src/lib/pdf-font-coverage.ts lists what it can draw.
const FONT_FAMILY = "Noto Serif";
let fontsRegistered = false;

// fontDir is a URL path in the browser ("/fonts") and a directory on disk in Node.
// Registering twice would add duplicate sources, so later calls are ignored.
export function registerPdfFonts(fontDir: string) {
  if (fontsRegistered) return;
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: `${fontDir}/NotoSerif-Regular.ttf` },
      { src: `${fontDir}/NotoSerif-Bold.ttf`, fontWeight: "bold" },
      { src: `${fontDir}/NotoSerif-Italic.ttf`, fontStyle: "italic" },
    ],
  });
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: { paddingVertical: 48, paddingHorizontal: 60, fontFamily: FONT_FAMILY, fontSize: 10, lineHeight: 1.35 },
  title: { fontWeight: "bold", fontSize: 16, textAlign: "center", marginBottom: 10 },
  paragraph: { marginBottom: 5 },
  sectionTitle: { fontWeight: "bold", marginTop: 4, marginBottom: 1 },
  hint: { fontWeight: "normal", fontStyle: "italic", fontSize: 9, color: "#666666" },
  bold: { fontWeight: "bold" },
  term: { textDecoration: "underline" },
  link: { color: "#3730a3", textDecoration: "underline" },
  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#999999", marginVertical: 6 },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#999999", padding: 4, minHeight: 22 },
  labelCell: { width: 120, fontWeight: "bold" },
  valueCell: { flex: 1 },
  footnote: { fontSize: 8.5, color: "#666666", marginTop: 6 },
  clause: { flexDirection: "row", marginBottom: 8 },
  clauseNumber: { width: 30 },
  clauseBody: { flex: 1 },
});

function Inlines({ content }: { content: Inline[] }) {
  return content.map((inline, i) => {
    switch (inline.kind) {
      case "text":
        return (
          <Text key={i} style={inline.bold ? styles.bold : undefined}>
            {inline.text}
          </Text>
        );
      case "term":
        return (
          <Text key={i} style={inline.bold ? [styles.term, styles.bold] : styles.term}>
            {inline.text}
          </Text>
        );
      case "value":
        return (
          <Text key={i} style={inline.placeholder ? undefined : styles.bold}>
            {inline.text}
          </Text>
        );
      case "link":
        return (
          <Link key={i} src={inline.href} style={styles.link}>
            {inline.text}
          </Link>
        );
    }
  });
}

export function DocumentPdf({ cover, terms }: { cover: CoverPage; terms: TermsBlock[] }) {
  return (
    <Document title={cover.title} author="Prelegal">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{cover.title}</Text>
        <Text style={styles.sectionTitle}>{cover.introHeading}</Text>
        <Text style={styles.paragraph}>
          <Inlines content={cover.intro} />
        </Text>

        {cover.sections.map((section) => (
          <View key={section.title} wrap={false}>
            <Text style={styles.sectionTitle}>
              {section.title}
              {section.hint && <Text style={styles.hint}>{`   ${section.hint}`}</Text>}
            </Text>
            {section.paragraphs.map((p, i) => (
              <Text key={i} style={styles.paragraph}>
                <Inlines content={p} />
              </Text>
            ))}
          </View>
        ))}

        <Text style={styles.paragraph}>{cover.signingStatement}</Text>

        <View style={styles.table} wrap={false}>
          <View style={styles.row}>
            <View style={[styles.cell, styles.labelCell]} />
            {cover.partyLabels.map((label) => (
              <Text key={label} style={[styles.cell, styles.valueCell, styles.bold, { textAlign: "center" }]}>
                {label}
              </Text>
            ))}
          </View>
          {cover.signatureRows.map((row) => (
            <View key={row.label} style={styles.row}>
              <View style={[styles.cell, styles.labelCell]}>
                <Text>{row.label}</Text>
                {row.hint && <Text style={styles.hint}>{row.hint}</Text>}
              </View>
              {row.values.map((cell, i) => (
                <Text key={i} style={[styles.cell, styles.valueCell]}>
                  <Inlines content={cell} />
                </Text>
              ))}
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>
          <Inlines content={cover.attribution} />
        </Text>
      </Page>

      <Page size="LETTER" style={styles.page}>
        {terms.map((block, i) => {
          switch (block.kind) {
            case "heading":
              return (
                <Text key={i} style={styles.title}>
                  {block.text}
                </Text>
              );
            case "clause":
              return (
                <View key={i} style={[styles.clause, { marginLeft: block.depth * 18 }]}>
                  <Text style={styles.clauseNumber}>{clauseLabel(block.number)}</Text>
                  <Text style={styles.clauseBody}>
                    <Inlines content={block.content} />
                  </Text>
                </View>
              );
            case "paragraph":
              return (
                <Text key={i} style={styles.footnote}>
                  <Inlines content={block.content} />
                </Text>
              );
          }
        })}
      </Page>
    </Document>
  );
}
