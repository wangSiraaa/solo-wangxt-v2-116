# MusicXML 排练台

纯前端 Vue 3 + TypeScript 应用，用 OpenSheetMusicDisplay 渲染未压缩的 partwise MusicXML，用 Web Audio 提供节拍参考，用 IndexedDB 保存本地工程，不需要后端。

## 启动

```bash
npm install
npm run dev
```

类型检查与生产构建：

```bash
npm run build
```

## 已实现的演奏路径规则

- 前反复、后反复及 `times` 次数。
- 跳房（volta bracket）1、2 及多编号；不同遍次只进入匹配的跳房。
- D.C. / D.S.、al Fine、al Coda、To Coda、Segno、Coda。
- 小节边界跳转；遇到小节中间的导航点会明确报错。
- 跳转目标缺失、Fine/Coda/Segno 不闭合、无限跳转保护均会阻止播放。
- 演奏路径按实际到达顺序生成，不按页面/书面小节编号递增。
- 弱起小节使用真实记谱时长，而不是后续 4/4 小节的完整小节长度。
- `<sound tempo>`、metronome、常见意大利速度术语和小节内速度变化参与分段计时。
- 不认识的 measure/barline/direction/sound 符号会产生错误或警告，不会静默当成普通小节略过。

## 样例

界面内置：

1. 双跳房：二房及多声部共有小节。
2. 速度与弱起：弱起、♩=90 到 ♩=144。
3. 综合：弱起、双跳房、小节内速度变化、两个声部。
4. D.S. 闭合：D.S. al Fine 的实际路径。
5. 无法闭合样例：D.S. 缺少 Segno，播放前报错。

## 数据与导出

- IndexedDB 保存原始 XML 和排练标记。
- “导出原 XML”逐字节保留当前工程读入的 XML。
- “导出带独立标记 XML”在原 XML 外追加独立的 `<rehearsal-stand-marks>` 容器，不改写原始音符、小节或记号。
- “导出标记 JSON”把原 XML 字符串与排练标记分开打包。
