# 本地乐谱排练台

纯前端 MusicXML 排练应用：Vue 3 + TypeScript + OpenSheetMusicDisplay + Web Audio + IndexedDB。

## 运行

```bash
npm install
npm run dev
```

构建与路径测试：

```bash
npm run build
npm run test:path
```

## 明确支持的演奏顺序记号

路径引擎不会按页面上的小节编号机械递增，而会根据以下记号生成“实际到达序列”：

- 前反复 / 后反复（`<repeat direction="forward|backward">`，含 `times`）
- 跳房 1、跳房 2 及多编号跳房（`<ending type="start|stop|discontinue">`）
- D.C.、D.C. al Fine、D.C. al Coda
- D.S.、D.S. al Fine、D.S. al Coda
- Segno、Coda、Fine、To Coda 的文字标记
- `<sound tempo="...">` 与 `<metronome>` 速度
- 拍号变化和 `implicit="yes"` 弱起小节
- 多声部、多声区共有小节：一个书面小节在各声部中只对应一个路径节点

内置样例覆盖：弱起、第 3 小节速度改变、第 5 小节多声部、跳房 1/2、后反复。第二个样例故意缺少 Segno/Fine，用于展示无法闭合跳转的错误诊断。

## 选择书面小节

点击乐谱小节或从“起始书面小节”选择后，右侧会列出该书面小节在演奏路径中的每次到达：

- 第几次到达
- 是顺序进入、反复返回、跳房跳过、D.C./D.S. 还是 To Coda
- 该次到达的精确起始时间
- 当前速度和跳房编号

“实际演奏路径”中的每一项都可点击，光标会跳到对应出现位置，而不是只跳到同名书面小节的第一次。

## 节拍和时长

Web Audio 使用 lookahead scheduler 生成每拍点击，第一拍加重。每小节拍数来自实际拍号，每拍秒数来自当前生效速度；弱起按实际音符时长而不是完整小节计算。速度改变后，后续小节立即使用新速度。

## 本地工程与导出

- 工程保存在浏览器 IndexedDB，无后端。
- “导出原 XML”逐字保存加载时的 MusicXML，不混入排练数据。
- “导出工程包”输出独立 JSON，包含 `originalXml` 与 `marks`；排练标记不写回 XML。
- 可重新导入工程包继续排练。

## 不静默忽略

解析器会显式报告：

- 各声部小节数不一致
- 找不到起点/终点的反复或跳房
- D.S. 缺 Segno、To Coda 缺 Coda、al Fine 缺 Fine
- 跳房未闭合、编号重叠
- 无法识别但看起来与跳转有关的文字
- 拍号变化等影响时长解释的信息

压缩 `.mxl` 与 `score-timewise` 当前不在明确支持范围内；打开时会直接提示，而不是尝试猜测或丢弃内容。
