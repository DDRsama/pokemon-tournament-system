const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function buildReportPythonSource() {
  return `
import json
import os
import re
import sys
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

font_name = "Helvetica"
for font_path in font_candidates:
    if os.path.exists(font_path):
        try:
            candidate_name = normalize_font_name(font_path)
            pdfmetrics.registerFont(TTFont(candidate_name, font_path))
            font_name = candidate_name
            break
        except Exception:
            pass
if font_name == "Helvetica":
    try:
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        font_name = "STSong-Light"
    except Exception:
        pass

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="BodyCN", fontName=font_name, fontSize=9, leading=14))
styles.add(ParagraphStyle(name="TitleCN", fontName=font_name, fontSize=18, leading=22, spaceAfter=8))
styles.add(ParagraphStyle(name="HeadingCN", fontName=font_name, fontSize=12, leading=16, spaceBefore=6, spaceAfter=6))
styles.add(ParagraphStyle(name="MetaCN", fontName=font_name, fontSize=8, leading=11, textColor=colors.HexColor("#555555")))

def make_table(rows, col_widths=None):
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font_name),
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
    story.append(Paragraph(data["tournamentName"], styles["TitleCN"]))
    story.append(Paragraph("{}{}".format(label("exportedAt", "导出时间："), data["generatedAt"]), styles["MetaCN"]))
    story.append(Spacer(1, 6))

    stages = data.get("stages", [])
    if stages:
        story.append(Spacer(1, 8))
        story.append(Paragraph(label("stagesTitle", "赛事阶段"), styles["HeadingCN"]))
        stage_rows = [[label("order", "顺序"), label("stage", "阶段"), label("type", "类型"), label("rules", "规则"), label("status", "状态")]]
        for stage in stages:
            stage_rows.append([stage.get("order", ""), stage.get("name", ""), stage.get("type", ""), stage.get("rules", ""), stage.get("status", "")])
        story.append(make_table(stage_rows, [14*mm, 42*mm, 28*mm, 58*mm, 24*mm]))

    if data.get("finalPlacements"):
        story.append(Spacer(1, 8))
        story.append(Paragraph(label("finalResultsTitle", "最终成绩"), styles["HeadingCN"]))
        final_rows = [[label("rank", "名次"), label("player", "选手"), label("result", "结果")]]
        for row in data.get("finalPlacements", []):
            final_rows.append([row.get("rankLabel") or row.get("rank", ""), row.get("player", ""), row.get("result", "")])
        story.append(make_table(final_rows, [28*mm, 72*mm, 72*mm]))

    if data.get("ranking"):
        story.append(Spacer(1, 8))
        story.append(Paragraph(label("swissRankingTitle", "瑞士轮总排名"), styles["HeadingCN"]))
        ranking_rows = [[label("rank", "名次"), label("player", "选手"), label("record", "战绩"), label("points", "积分"), label("omw", "对手胜率"), label("oow", "对手的对手胜率"), label("note", "备注")]]
        for row in data.get("ranking", []):
            ranking_rows.append([row["rank"], row["player"], row["record"], row["points"], row["omw"], row["oow"], row["note"]])
        story.append(make_table(ranking_rows, [16*mm, 46*mm, 22*mm, 16*mm, 24*mm, 28*mm, 24*mm]))

    for page in data.get("swissRounds", []):
        story.append(PageBreak())
        story.append(Paragraph(page["label"], styles["HeadingCN"]))
        rows = [[label("table", "桌号"), label("playerA", "选手A"), label("playerB", "选手B"), label("result", "结果")]]
        for match in page.get("matches", []):
            rows.append([match["tableLabel"], match["p1"], match["p2"], match["result"]])
        story.append(make_table(rows, [20*mm, 60*mm, 60*mm, 34*mm]))

    if data.get("top8Rounds"):
        story.append(PageBreak())
        story.append(Paragraph(label("eliminationTitle", "淘汰赛"), styles["HeadingCN"]))
        for group in data.get("top8Rounds", []):
            story.append(Paragraph(group["label"], styles["BodyCN"]))
            rows = [[label("table", "桌号"), label("playerA", "选手A"), label("playerB", "选手B"), label("result", "结果")]]
            for match in group.get("matches", []):
                rows.append([match["tableLabel"], match["p1"], match["p2"], match["result"]])
            story.append(make_table(rows, [20*mm, 60*mm, 60*mm, 34*mm]))
            story.append(Spacer(1, 8))

    if data.get("pointAwards"):
        story.append(PageBreak())
        story.append(Paragraph(label("pointAwardsTitle", "积分发放"), styles["HeadingCN"]))
        rows = [[label("rank", "名次"), label("player", "选手"), label("participationPoints", "参赛分"), label("placementPoints", "名次分"), label("multiplier", "倍率"), label("totalPoints", "总分")]]
        for award in data.get("pointAwards", []):
            rows.append([award.get("rank", ""), award.get("displayName", ""), award.get("participationPoints", 0), award.get("placementPoints", 0), award.get("multiplier", 1), award.get("points", 0)])
        story.append(make_table(rows, [16*mm, 52*mm, 22*mm, 22*mm, 20*mm, 22*mm]))

elif report_type == "player":
    story.append(Paragraph(data.get("reportTitle") or "{} - 个人战报".format(data["tournamentName"]), styles["TitleCN"]))
    story.append(Paragraph("{}{}".format(label("exportedAt", "导出时间："), data["generatedAt"]), styles["MetaCN"]))
    story.append(Spacer(1, 6))
    meta_rows = [
        [label("player", "选手"), data["playerName"], label("finalResult", "最终结果"), data["finalStatus"]],
        [label("record", "战绩"), data["record"], label("points", "积分"), data["points"]],
        [label("swissRank", "瑞士轮排名"), data["swissRank"] if data["swissRank"] is not None else "-", label("omw", "对手胜率"), data["omw"] if data["omw"] is not None else "-"],
        [label("oow", "对手的对手胜率"), data["oow"] if data["oow"] is not None else "-", "", ""],
    ]
    story.append(make_table([[label("item", "项目"), label("content", "内容"), label("item", "项目"), label("content", "内容")], *meta_rows], [24*mm, 62*mm, 24*mm, 62*mm]))
    story.append(Spacer(1, 10))
    story.append(Paragraph(label("personalHistoryTitle", "个人对局记录"), styles["HeadingCN"]))
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
