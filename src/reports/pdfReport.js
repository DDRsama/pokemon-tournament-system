const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function buildReportPythonSource() {
  return `
import json
import os
import re
import sys
from xml.sax.saxutils import escape
from reportlab.lib.enums import TA_CENTER
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
report_type = payload.get("type")
target_path = payload["targetPath"]
data = payload["data"]
font_candidates = payload.get("fontCandidates", [])
labels = data.get("labels", {})

def label(key, fallback):
    return labels.get(key, fallback)

def normalize_font_name(font_path):
    base = os.path.splitext(os.path.basename(font_path))[0]
    safe = re.sub(r'[^A-Za-z0-9_-]+', '-', base).strip('-')
    return safe or 'ReportFont'

registered_fonts = []
seen_font_paths = set()
seen_font_names = set()
for font_path in font_candidates:
    normalized_path = os.path.abspath(str(font_path or ""))
    if not normalized_path or normalized_path in seen_font_paths or not os.path.exists(normalized_path):
        continue
    seen_font_paths.add(normalized_path)
    try:
        base_name = normalize_font_name(normalized_path)
        candidate_name = base_name
        suffix = 2
        while candidate_name in seen_font_names:
            candidate_name = "{}-{}".format(base_name, suffix)
            suffix += 1
        font = TTFont(candidate_name, normalized_path)
        pdfmetrics.registerFont(font)
        seen_font_names.add(candidate_name)
        registered_fonts.append({
            "name": candidate_name,
            "coverage": set(font.face.charToGlyph.keys()),
        })
    except Exception:
        pass

base_font_name = registered_fonts[0]["name"] if registered_fonts else "Helvetica"
if not registered_fonts:
    try:
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        base_font_name = "STSong-Light"
    except Exception:
        pass

def font_for_char(char):
    codepoint = ord(char)
    for font in registered_fonts:
        if codepoint in font["coverage"]:
            return font["name"]
    return base_font_name

def rich_text(value):
    text = "" if value is None else str(value)
    if not text:
        return ""
    chunks = []
    current_font = None
    current_chars = []
    for char in text:
        next_font = font_for_char(char)
        if next_font != current_font and current_chars:
            chunks.append((current_font, "".join(current_chars)))
            current_chars = []
        current_font = next_font
        current_chars.append(char)
    if current_chars:
        chunks.append((current_font, "".join(current_chars)))
    parts = []
    for font_name, chunk in chunks:
        escaped = escape(chunk).replace("\\n", "<br/>")
        if font_name == base_font_name:
            parts.append(escaped)
        else:
            parts.append('<font name="{}">{}</font>'.format(escape(font_name), escaped))
    return "".join(parts)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="BodyCN", fontName=base_font_name, fontSize=9, leading=14))
styles.add(ParagraphStyle(name="TableCN", fontName=base_font_name, fontSize=8, leading=10, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="TitleCN", fontName=base_font_name, fontSize=18, leading=22, spaceAfter=8))
styles.add(ParagraphStyle(name="HeadingCN", fontName=base_font_name, fontSize=12, leading=16, spaceBefore=6, spaceAfter=6))
styles.add(ParagraphStyle(name="MetaCN", fontName=base_font_name, fontSize=8, leading=11, textColor=colors.HexColor("#555555")))

def para(value, style_name="BodyCN"):
    return Paragraph(rich_text(value), styles[style_name])

def make_table(rows, col_widths=None):
    table_rows = [[cell if hasattr(cell, "wrap") else para(cell, "TableCN") for cell in row] for row in rows]
    table = Table(table_rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("LEADING", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#111827")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#c7c9cc")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table

doc = SimpleDocTemplate(target_path, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm)
story = []

if report_type == "tournament":
    story.append(para(data["tournamentName"], "TitleCN"))
    story.append(para("{}{}".format(label("exportedAt", "导出时间："), data["generatedAt"]), "MetaCN"))
    story.append(Spacer(1, 6))

    stages = data.get("stages", [])
    if stages:
        story.append(Spacer(1, 8))
        story.append(para(label("stagesTitle", "赛事阶段"), "HeadingCN"))
        stage_rows = [[label("order", "顺序"), label("stage", "阶段"), label("type", "类型"), label("rules", "规则"), label("status", "状态")]]
        for stage in stages:
            stage_rows.append([stage.get("order", ""), stage.get("name", ""), stage.get("type", ""), stage.get("rules", ""), stage.get("status", "")])
        story.append(make_table(stage_rows, [14*mm, 42*mm, 28*mm, 58*mm, 24*mm]))

    if data.get("finalPlacements"):
        story.append(Spacer(1, 8))
        story.append(para(label("finalResultsTitle", "最终成绩"), "HeadingCN"))
        final_rows = [[label("rank", "名次"), label("player", "选手"), label("result", "结果")]]
        for row in data.get("finalPlacements", []):
            final_rows.append([row.get("rankLabel") or row.get("rank", ""), row.get("player", ""), row.get("result", "")])
        story.append(make_table(final_rows, [28*mm, 72*mm, 72*mm]))

    if data.get("ranking"):
        story.append(Spacer(1, 8))
        story.append(para(label("swissRankingTitle", "瑞士轮总排名"), "HeadingCN"))
        ranking_rows = [[label("rank", "名次"), label("player", "选手"), label("record", "战绩"), label("points", "积分"), label("omw", "对手胜率"), label("oow", "对手的对手胜率"), label("note", "备注")]]
        for row in data.get("ranking", []):
            ranking_rows.append([row["rank"], row["player"], row["record"], row["points"], row["omw"], row["oow"], row["note"]])
        story.append(make_table(ranking_rows, [16*mm, 46*mm, 22*mm, 16*mm, 24*mm, 28*mm, 24*mm]))

    for page in data.get("swissRounds", []):
        story.append(PageBreak())
        story.append(para(page["label"], "HeadingCN"))
        rows = [[label("table", "桌号"), label("playerA", "选手A"), label("playerB", "选手B"), label("result", "结果")]]
        for match in page.get("matches", []):
            rows.append([match["tableLabel"], match["p1"], match["p2"], match["result"]])
        story.append(make_table(rows, [20*mm, 60*mm, 60*mm, 34*mm]))

    if data.get("top8Rounds"):
        story.append(PageBreak())
        story.append(para(label("eliminationTitle", "淘汰赛"), "HeadingCN"))
        for group in data.get("top8Rounds", []):
            story.append(para(group["label"], "BodyCN"))
            rows = [[label("table", "桌号"), label("playerA", "选手A"), label("playerB", "选手B"), label("result", "结果")]]
            for match in group.get("matches", []):
                rows.append([match["tableLabel"], match["p1"], match["p2"], match["result"]])
            story.append(make_table(rows, [20*mm, 60*mm, 60*mm, 34*mm]))
            story.append(Spacer(1, 8))

    if data.get("pointAwards"):
        story.append(PageBreak())
        story.append(para(label("pointAwardsTitle", "积分发放"), "HeadingCN"))
        rows = [[label("rank", "名次"), label("player", "选手"), label("participationPoints", "参赛分"), label("placementPoints", "名次分"), label("multiplier", "倍率"), label("totalPoints", "总分")]]
        for award in data.get("pointAwards", []):
            rows.append([award.get("rank", ""), award.get("displayName", ""), award.get("participationPoints", 0), award.get("placementPoints", 0), award.get("multiplier", 1), award.get("points", 0)])
        story.append(make_table(rows, [16*mm, 52*mm, 22*mm, 22*mm, 20*mm, 22*mm]))

elif report_type == "player":
    story.append(para(data.get("reportTitle") or "{} - 个人战报".format(data["tournamentName"]), "TitleCN"))
    story.append(para("{}{}".format(label("exportedAt", "导出时间："), data["generatedAt"]), "MetaCN"))
    story.append(Spacer(1, 6))
    meta_rows = [
        [label("player", "选手"), data["playerName"], label("finalResult", "最终结果"), data["finalStatus"]],
        [label("record", "战绩"), data["record"], label("points", "积分"), data["points"]],
        [label("swissRank", "瑞士轮排名"), data["swissRank"] if data["swissRank"] is not None else "-", label("omw", "对手胜率"), data["omw"] if data["omw"] is not None else "-"],
        [label("oow", "对手的对手胜率"), data["oow"] if data["oow"] is not None else "-", "", ""],
    ]
    story.append(make_table([[label("item", "项目"), label("content", "内容"), label("item", "项目"), label("content", "内容")], *meta_rows], [24*mm, 62*mm, 24*mm, 62*mm]))
    story.append(Spacer(1, 10))
    story.append(para(label("personalHistoryTitle", "个人对局记录"), "HeadingCN"))
    history_rows = [[label("stage", "阶段"), label("table", "桌号"), label("opponent", "对手"), label("beforeRecord", "本轮前战绩"), label("result", "结果"), label("detail", "详情")]]
    for item in data.get("history", []):
        history_rows.append([
            item["stage"],
            f'{item["table"] if item["table"] is not None else "-"}{" [TV]" if item.get("wasLive") else ""}',
            item["opponent"] or "-",
            item["beforeRecord"] or "-",
            item["result"],
            item["resultText"],
        ])
    story.append(make_table(history_rows, [22*mm, 18*mm, 24*mm, 22*mm, 14*mm, 72*mm]))

doc.build(story)
print(target_path)
`;
}

function runPythonReport({ pythonBin, reportsDir, reportType, data, targetPath, fontCandidates = [] }) {
  fs.mkdirSync(reportsDir, { recursive: true });
  const scriptPath = path.join(reportsDir, '_render_report.py');
  fs.writeFileSync(scriptPath, buildReportPythonSource(), 'utf8');
  const payload = JSON.stringify({ type: reportType, data, targetPath, fontCandidates });
  const result = spawnSync(pythonBin, [scriptPath], {
    input: payload,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `report generation failed (${result.status})`);
  }
  return targetPath;
}

function exportTournamentReportFile({ state, reportsDir, pythonBin, isTournamentFinished, sanitizeFilePart, buildTournamentReportData, fontCandidates = [] }) {
  if (!isTournamentFinished(state)) return null;
  const fileName = `${sanitizeFilePart(state.tournamentName, 'tournament')}-report.pdf`;
  const targetPath = path.join(reportsDir, fileName);
  runPythonReport({
    pythonBin,
    reportsDir,
    reportType: 'tournament',
    data: buildTournamentReportData(state),
    targetPath,
    fontCandidates,
  });
  return targetPath;
}

function exportPlayerReportFile({ playerName, state, reportsDir, pythonBin, sanitizeFilePart, buildPlayerReportData, fontCandidates = [] }) {
  const reportData = buildPlayerReportData(playerName, state);
  if (!reportData) return null;
  const fileName = `${sanitizeFilePart(state.tournamentName, 'tournament')}-${sanitizeFilePart(playerName, 'player')}-report.pdf`;
  const targetPath = path.join(reportsDir, fileName);
  runPythonReport({
    pythonBin,
    reportsDir,
    reportType: 'player',
    data: reportData,
    targetPath,
    fontCandidates,
  });
  return targetPath;
}

module.exports = {
  buildReportPythonSource,
  runPythonReport,
  exportTournamentReportFile,
  exportPlayerReportFile,
};
