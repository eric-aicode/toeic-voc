import os
import re
import json

workspace_dir = r"g:\我的雲端硬碟\APPS\多益單字書學習APP"
data_dir = os.path.join(workspace_dir, "data")
os.makedirs(data_dir, exist_ok=True)
output_js = os.path.join(data_dir, "toeic_data.js")

def parse_day_file(day_num, fpath):
    with open(fpath, "r", encoding="utf-8") as f:
        text = f.read()

    lines = text.splitlines()
    
    # 1. 抓取標題與副標題
    first_line = lines[0] if lines else ""
    m_title = re.search(r"#\s+Day\s+(\d+)\s+(.*?)(?:（主題：(.*?)）)?(?:完整課程內容)?$", first_line)
    sub_title = m_title.group(2).strip() if m_title else f"Day {day_num:02d}"
    theme_info = m_title.group(3).strip() if (m_title and m_title.group(3)) else ""

    # 2. 切分章節
    story_lines = []
    vocab_lines = []
    level_lines = []
    
    current_sec = None
    for line in lines[1:]:
        if "## 1. 主題情境對話" in line:
            current_sec = "story"
            continue
        elif "## 2. 核心單字" in line:
            current_sec = "vocab"
            continue
        elif "## 3. Daily Checkup" in line:
            current_sec = "checkup"
            continue
        elif "## 4. 分級補充單字" in line:
            current_sec = "level"
            continue
        elif line.startswith("## ") and current_sec:
            current_sec = None
            
        if current_sec == "story":
            story_lines.append(line)
        elif current_sec == "vocab":
            vocab_lines.append(line)
        elif current_sec == "level":
            level_lines.append(line)

    story_text = "\n".join(story_lines).strip()

    # 3. 解析核心單字
    words = []
    i = 0
    while i < len(vocab_lines):
        line = vocab_lines[i]
        # 匹配：1. **word**[stars] [phonetic]
        m_head = re.match(r"^(\d+)\.\s+\*\*([a-zA-Z\u00C0-\u017F\s\-\'/]+?)\*\*(\*+)?\s*(.*)$", line)
        if m_head:
            w_id = int(m_head.group(1))
            w_word = m_head.group(2).strip()
            w_stars = len(m_head.group(3) or "")
            rest = m_head.group(4).strip()
            
            # 抓取音標 (例如 [ˈrɛzʊme] / [ˈrɛzjʊmeɪ])
            phonetic = ""
            m_phon = re.search(r"(\[.*?\](?:.*?[\[\/].*?\])?)", rest)
            if m_phon:
                phonetic = m_phon.group(1).strip()
            elif rest:
                phonetic = rest

            i += 1
            pos_meanings = []
            examples = []
            tips = []
            supplements = []
            
            while i < len(vocab_lines) and not re.match(r"^\d+\.\s+\*\*", vocab_lines[i]) and not vocab_lines[i].startswith("---"):
                cur = vocab_lines[i].strip()
                if not cur:
                    i += 1
                    continue
                    
                # 詞性釋義 (如 * **n. 履歷表** 或 * **adj. 有資格的**)
                m_pm = re.match(r"^\*\s+\*\*([a-z\.\/\s]+?)\.\s*(.+?)\*\*$", cur)
                if m_pm and not cur.startswith("* **例句") and not cur.startswith("* **相關") and not cur.startswith("* **同義") and not cur.startswith("* **補充"):
                    pos_meanings.append({
                        "pos": m_pm.group(1).strip() + ".",
                        "meaning": m_pm.group(2).strip()
                    })
                    i += 1
                    continue
                # 備用詞性匹配 (無句點形式)
                m_pm_alt = re.match(r"^\*\s+\*\*(n|v|adj|adv|phr|prep|conj|interj)\s+(.+?)\*\*$", cur)
                if m_pm_alt:
                    pos_meanings.append({
                        "pos": m_pm_alt.group(1).strip() + ".",
                        "meaning": m_pm_alt.group(2).strip()
                    })
                    i += 1
                    continue
                    
                # 例句
                if cur.startswith("* **例句**："):
                    # 可能單行或多行
                    ex_header = cur.replace("* **例句**：", "").strip()
                    if ex_header:
                        # 單行例句
                        # 分割中英文，例句格式為: English sentence.（中文翻譯。）
                        m_ex_pair = re.search(r"^(.*?)[（\(](.*?)[）\)]\s*$", ex_header)
                        if m_ex_pair:
                            en = m_ex_pair.group(1).strip()
                            zh = m_ex_pair.group(2).strip()
                        else:
                            en = ex_header
                            zh = ""
                        examples.append({"en": en, "zh": zh})
                    # 檢查後續是否有縮排的多個例句 (1. 2.)
                    i += 1
                    while i < len(vocab_lines) and (re.match(r"^\s*\d+\.\s+", vocab_lines[i]) or (vocab_lines[i].startswith("     "))):
                        sub_ex = vocab_lines[i].strip()
                        m_sub = re.match(r"^\d+\.\s+(.*?)[（\(](.*?)[）\)]\s*$", sub_ex)
                        if m_sub:
                            examples.append({"en": m_sub.group(1).strip(), "zh": m_sub.group(2).strip()})
                        else:
                            examples.append({"en": sub_ex, "zh": ""})
                        i += 1
                    continue
                    
                # 出題重點
                if "💡 **出題重點**" in cur:
                    tip_head = cur.split("出題重點**：")[-1].strip()
                    if tip_head:
                        tips.append(tip_head)
                    i += 1
                    while i < len(vocab_lines) and (vocab_lines[i].startswith("     ") or vocab_lines[i].startswith("  * ") or vocab_lines[i].startswith("    * ")):
                        st = vocab_lines[i].strip().lstrip("*").strip()
                        if st:
                            tips.append(st)
                        i += 1
                    continue
                    
                # 補充 / 相關詞 / 同義詞
                if cur.startswith("* **相關詞**：") or cur.startswith("* **同義詞**：") or cur.startswith("* **補充**："):
                    supplements.append(cur.lstrip("*").strip())
                elif cur.startswith("* "):
                    # 其他說明
                    supplements.append(cur.lstrip("*").strip())
                i += 1
                
            # 如果沒有抓到正規詞性釋義，嘗試抓取第一行作為釋義
            if not pos_meanings:
                pos_meanings.append({"pos": "general", "meaning": ""})

            # 清理例句中的加粗標記，但同時生成挖空版
            clean_examples = []
            for ex in examples:
                raw_en = ex["en"]
                # 找出加粗詞或單字本身進行挖空
                # 例如 **résumé** 替換成 [ ______ ]
                cloze_en = re.sub(r"\*\*.*?\*\*", "______", raw_en)
                # 清除一般例句中的星號
                display_en = raw_en.replace("**", "")
                clean_examples.append({
                    "en": display_en,
                    "cloze": cloze_en,
                    "zh": ex["zh"]
                })

            words.append({
                "id": f"D{day_num:02d}_{w_id:02d}",
                "num": w_id,
                "day": day_num,
                "word": w_word,
                "stars": w_stars,
                "phonetic": phonetic,
                "posMeanings": pos_meanings,
                "examples": clean_examples,
                "tips": tips,
                "supplements": supplements
            })
            continue
        i += 1

    return {
        "day": day_num,
        "title": sub_title,
        "theme": theme_info,
        "story": story_text,
        "wordCount": len(words),
        "words": words
    }

all_days = []
total_words = 0

for d in range(1, 31):
    fpath = os.path.join(workspace_dir, f"day{d:02d}-toeic-vocab.md")
    if os.path.exists(fpath):
        day_data = parse_day_file(d, fpath)
        all_days.append(day_data)
        total_words += len(day_data["words"])
        print(f"Parsed Day {d:02d}: {day_data['title']} ({len(day_data['words'])} words)")

# 輸出成 toeic_data.js
js_content = f"""/**
 * TOEIC 30-Day Vocabulary Database
 * Generated automatically from standardized Markdown files.
 * Total Days: {len(all_days)}
 * Total Core Words: {total_words}
 */

window.TOEIC_DATA = {{
  totalDays: {len(all_days)},
  totalWords: {total_words},
  days: {json.dumps(all_days, ensure_ascii=False, indent=2)}
}};
"""

with open(output_js, "w", encoding="utf-8") as f:
    f.write(js_content)

print(f"\nSUCCESS: Data built successfully to {output_js}")
print(f"Total Words: {total_words}, Total Days: {len(all_days)}")
