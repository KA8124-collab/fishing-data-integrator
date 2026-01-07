const ss = SpreadsheetApp.getActiveSpreadsheet();
const inputSheet = ss.getSheetByName("釣行入力");
const outputSheet = ss.getSheetByName("気象・潮汐データ");
const configTideSheet = ss.getSheetByName("潮汐観測点設定");
const configWthrSheet = ss.getSheetByName("気象観測点設定");

const headerRow = 1;

const jmaAll = "https://www.data.jma.go.jp/stats/etrn/select/prefecture00.php?";
