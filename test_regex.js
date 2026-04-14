
const n = "🇯🇵日本2号 三网高速";
const regex = /(到期|有效|剩余|过期|流量|测试|更新|套餐|官网|群|联系客服|通知|\d{4}[-/]\d{2}[-/]\d{2}|\b\d+(\.\d+)?\s*[MGT]B?\s*[/｜|]\s*\d+(\.\d+)?\s*[MGT]B?)/i;
console.log("Match result:", regex.test(n));
console.log("Match detail:", n.match(regex));
