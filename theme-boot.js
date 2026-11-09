// Multi-Level Sort · https://github.com/JB-designer/Multi-Level-Sort · MIT License
// 结果页第一帧就用面板里选的主题(results.js 会把选择同步到这里读的副本)
(function () {
  try {
    var v = localStorage.getItem("cardSorterTheme");
    if (v === "light" || v === "dark") document.documentElement.setAttribute("data-theme", v);
  } catch (error) { /* 读不到就跟随系统 */ }
})();
