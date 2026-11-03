# 6A 錯題書架

靜態網站：奶油紙質 UI + Three.js 三維書架，按年份瀏覽 Form 6A 個人錯題簿 PDF。視覺參考 `hyeok-library`（上赫書架）風格，內容同品牌為本校 6A 錯題書架，並非該專案複製品。

## 目錄

```
web/
  index.html          # 入口（繁中香港）
  catalog.json        # 個人 PDF 目錄（由拆冊腳本產生）
  library/            # symlink → exports/dse-library-personal/library
    6A/{student_id}/{year}.pdf
  js/
    world.js          # 走廊／書架／燈光
    books.js          # 年份樓層、書脊貼圖、擺書
    app.js            # 閘口、狀態、PDF 閱讀器
  README.md
```

## 本機執行

必須用 HTTP 伺服器（ES modules + `fetch`），唔好直接開 `file://`。

```bash
cd /workspace/dse-personal-library/web
python3 -m http.server 8765
# 或: npx --yes serve -l 8765
```

瀏覽器開：<http://127.0.0.1:8765/>


## 遊玩操作（遊戲感）

1. **閘口**：學號 01–22 或教師模式。
2. **大堂 intro**：黑貓在入口回頭望；撳提示／導覽板 → 貓行去年份板（sign）。
3. **年份旅行**：揀年份後貓沿走廊行／「行樓梯」淡入，再到該年書架坐好。
4. **自由行**：大堂或書架「自由行」後可用 **WASD／箭咀**；撳地板行到該點；手機用左下虛擬搖桿。
5. **摸摸貓**：撳貓會跳一下。
6. **書架**：撳書脊 → 詳情 → 打開 PDF。大堂掣返入口。

`?still=1` 可凍結貓動作（除錯）。

## 使用流程（閘口／PDF）


1. **閘口**：輸入學號 01–22 → 只見該生各年冊；或「教師模式」見全班。
2. **年份書籤／其他年份**：揀樓層（2012、2013、2014、2018、2023–2026）。
3. **書架**：撳書脊 → 詳情卡 →「打開 PDF」（iframe）或新分頁。
4. **大堂／切換身份**：右上角可返大堂或重新登入。

## 資料更新

個人 PDF 同目錄來源：

- `/workspace/exports/dse-library-personal/library/`
- `/workspace/exports/dse-library-personal/catalog.json`

拆冊腳本：`../scripts/split_class_year_pdfs.py`（由全班 `class-correction-YYYY.pdf` 按 `Student No.` 切開）。

更新後重新 copy／確認 symlink，再把新 `catalog.json` 放到 `web/`：

```bash
cp /workspace/exports/dse-library-personal/catalog.json /workspace/dse-personal-library/web/catalog.json
# library 已係 symlink，一般唔使再 copy
```

## 部署（未執行）

適合 Cloudflare Pages / Vercel 靜態托管：上傳整個 `web/`（注意 `library/` 要係真實檔案，唔好得一個斷咗嘅 symlink）。部署前可：

```bash
rsync -a --copy-links /workspace/dse-personal-library/web/ /tmp/dse-library-dist/
# 然後把 /tmp/dse-library-dist 交畀 Pages
```

## 已知限制／stub

- 無貓咪跟隨／訪客留言／展覽館等 hyeok 原站互動（刻意精簡）。
- 無登入帳密；學號閘口係前端篩選，唔係保安。
- 姓名欄而家空白（來源 `errors.xlsx` 刻意唔印名）。
- 某年無人有錯題時該層顯示「空」。
- PDF 用瀏覽器內置 viewer（iframe）；極舊瀏覽器可能要開新分頁。
