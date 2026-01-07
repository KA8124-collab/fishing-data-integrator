/**
 * 2026-01-07 v0.5
 * 機能
 *  入力シートの必須項目を埋めると気象庁サイトから気象・潮汐情報を取得し1時間刻みで貼り付け
 * 仕様
 *  同一日内の釣行のみ対応
 *  開始時刻と終了時刻は1〜23時対応
 *  （0時の場合気象庁サイトの仕様により情報が取得できない場合があります）
 *  入力誤りによる釣行ID欠番は放置して次の番号を取得してください。
 *  気象・潮汐は代表観測点の生データを取得
 *  分析結果・釣果予測は行わない
 *  潮型（大潮等）は表示しない
 */

function integration () {
  const headerIdx = headerSearch();
  const newRows = fetchId(headerIdx);
  const urlToWatch =generateUrl(newRows);
  fetchData(urlToWatch);
  confirmId(headerIdx, urlToWatch);
}

/**0 入力ヘッダ行の整理(手入力パートなので堅牢に) */
function headerSearch() {
  const tsDict = {"id": "釣行ID(自動入力)", 
                  "date": "釣行日(必須)",
                  "start": "開始時(必須)",
                  "end": "終了時(必須)",
                  "lat": "緯度(必須)",
                  "lon": "経度(必須)",
                  "memo": "釣行メモ(任意)",
                  "fetched": "データ取得済"
  }
  const header = inputSheet.getRange(headerRow, 1, 1, inputSheet.getLastColumn()).getValues()[0];
  // Logger.log(header);  //1.1.1
  let headerIdx = {};
  for (key in tsDict) {
    headerIdx[key] = header.indexOf(tsDict[key]);
  }
  return headerIdx;
  // Logger.log(headerIdx);  //1.1.2
}

/** 1 釣行ID取得 */
function fetchId (headerIdx) {
/**1.2 データの取得と行の走査 */
  let table = inputSheet.getRange(headerRow+1, 1, inputSheet.getLastRow()-headerRow, inputSheet.getLastColumn()).getValues();
  // Logger.log(table);  //1.2.1
  let lastId = 0;
  for (row of table) {
    if (row[headerIdx.fetched]==true){
      if (row.headerIdx.id >= lastId) {
        lastId = row.headerIdx.id;
      }
    }
  }
  let newRows = [];
  for (let i=0; i<table.length; i++) {
    if (table[i][headerIdx.fetched] !== true) {
      let tempObj = {};
      table[i][headerIdx.id] = lastId + 1;
      // table[i][headerIdx.fetched] = true;  →最後に
      for (clm in headerIdx) {
        tempObj[clm] = table[i][headerIdx[clm]];
      }
      newRows.push(tempObj);
    }
  }
  // Logger.log(table);  //1.2.2
  // Logger.log(newRows);  //1.2.3

  /**1.3 書き戻しと次段階への受け渡し */
  inputSheet.getRange(headerRow+1,1,table.length,table[0].length).setValues(table);
  return newRows;
}

function generateUrl (newRows) {
/**2 新規ID行に対し気象・潮汐情報を参照するURLを作成 */
/**2.1 configから一覧を取得*/

  const tideStaTable = configTideSheet.getRange(headerRow+1, 1, configTideSheet.getLastRow()-headerRow,configTideSheet.getLastColumn()).getValues();
  const wthrStaTable = configWthrSheet.getRange(headerRow+1,1,configWthrSheet.getLastRow()-headerRow,configWthrSheet.getLastColumn()).getValues();
  // Logger.log(tideStaTable); //2.1.1
  // Logger.log(wthrStaTable); //2.1.2
/**2.2 haversine関数を輸入して各点間の差を計算、近傍点を抽出 */
  let fetchElement = [];

  for (row of newRows) {
    let cur_dist_t = Math.pow(10,6); //十分大きな数
    let cur_dist_w = Math.pow(10,6); //十分大きな数
    let temp_point = 
    {
                "id":row.id,
                "tss" : "",
                "ws_proc": 0,
                "ws_block":0,
                "year": Utilities.formatDate(new Date(row.date),"JST","yyyy"),
                "month": Utilities.formatDate(new Date(row.date),"JST","MM"),
                "day": Utilities.formatDate(new Date(row.date),"JST","dd"),
                "start": row.start,
                "end":row.end
    }
    let lon1 = Number(row.lon);
    let lat1 = Number(row.lat);
    for (tideSta of tideStaTable) {
      let lon2 = Number(tideSta[3]);
      let lat2 = Number(tideSta[2]);
      let d = haversine_ (lon1, lat1, lon2, lat2);
      if (d < cur_dist_t) {
        cur_dist_t = d;
        temp_point.tss = tideSta[1];
      }
    }
    for (wthrSta of wthrStaTable) {
      let lon2 = Number(wthrSta[4]);
      let lat2 = Number(wthrSta[3]);
      let d = haversine_ (lon1, lat1, lon2, lat2);
      if (d < cur_dist_w) {
        cur_dist_w = d;
        temp_point.ws_proc = wthrSta[1];
        temp_point.ws_block = wthrSta[2];      
     }
    }
    fetchElement.push(temp_point);
  }
  // Logger.log(fetchElement); //2.2.1

/**2.3 URLを作り、参照すべき時刻、日付とともに次工程へ送る */
  let urlToWatch = [];
  for (element of fetchElement) {
    let eachItem = {
      "id": element.id,
      "url_t":`https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/${element.year}/${element.tss}.txt`,
      "url_w":`https://www.data.jma.go.jp/stats/etrn/view/hourly_s1.php?prec_no=${element.ws_proc}&block_no=${element.ws_block}&year=${element.year}&month=${element.month}&day=${element.day}&view=`,
      "year":element.year,
      "month":element.month,
      "day":element.day,
      "start":element.start,
      "end":element.end  
    };
    urlToWatch.push(eachItem);
  }
  // Logger.log(urlToWatch); //2.3.1
  return urlToWatch;
}
function haversine_ (lon1, lat1, lon2, lat2) {
  /**2.2 点間の距離計測*/
  const r = 6371;
  let dLat = (lat2 - lat1) * Math.PI / 180;
  let dLon = (lon2 - lon1) * Math.PI / 180;
  let rlat1 = lat1 * Math.PI / 180;
  let rlat2 = lat2 * Math.PI / 180;
  let a = Math.pow(Math.sin(dLat/2),2) + Math.cos(rlat1)*Math.cos(rlat2)*Math.pow(Math.sin(dLon/2),2)
  let c = 2 * Math.asin(Math.sqrt(a));
  let d = r * c;
  return d
}

function fetchData(urlToWatch) {
/**3 urlを見に行って気象潮汐データシートに書き出し */
/**3.1 urlに接続して必要なデータを取得 */
  let tideData = [];
  let whtrData = [];
  for (row of urlToWatch) {
    let targetTide = fetchEachTide_(row);
    let targetWeather = fetchEachWthr_(row);
    tideData.push(targetTide)
    whtrData.push(targetWeather);
  }
  // Logger.log(tideData); //3.1.3.1
  // Logger.log(whtrData); //3.1.3.2

/**3.2 出力内容の作成 */
  let output = [];
  for (let i=0; i<tideData.length; i++) {
    for (timeT of tideData[i]) {
      let row = [];
      let hour = `${timeT.year}-${timeT.month}-${timeT.day} ${timeT.time}:00`;
      for (timeW of whtrData[i]) {
        if (timeT.id == timeW.id && timeT.time == timeW.time) { 
          row = [timeT.id, hour, timeW.temperature, timeW.wind_speed, timeW.wind_dir, timeW.pressure_land, timeW.wthr, timeT.tide];
        }
      }
    if (row.length > 0) output.push(row);
    }
  }
  Logger.log(output); //3.2.1
/**3.3  書き出し*/
  outputSheet.getRange(outputSheet.getLastRow()+1, 1, output.length, output[0].length).setValues(output);
}
function fetchEachTide_ (row) {
/**3.1.1  新規各行の必要な潮位を取得*/
  const oneDigit = {
  "01": " 1",
  "02": " 2",
  "03": " 3",
  "04": " 4",
  "05": " 5",
  "06": " 6",
  "07": " 7",
  "08": " 8",
  "09": " 9"
  }
  const rawT = UrlFetchApp.fetch(row.url_t).getContentText();
  // Logger.log(rawT); //3.1.1.1
  const arrayT = rawT.split("\n");
  let targetTide = [];
  for (str of arrayT) {
    if ((str.slice(74,76) == oneDigit[row.month] ||str.slice(74,76) == row.month) && (str.slice(76,78) == oneDigit[row.day] || str.slice(76,78) == row.day)) { 
      str = str.slice(Number(row.start)*3,(Number(row.end)+1)*3);
      // Logger.log(str);  //3.1.1.2
      for (let i=0; i<=Number(row.end)-Number(row.start); i++) {
        let each_tide = {"id": row.id, "year": row.year, "month": row.month, "day": row.day};
        each_tide.time = Number(row.start)+i;
        each_tide.tide = str.slice(i*3+0,i*3+3);
        targetTide.push(each_tide);
      }
    }
  }
  Logger.log(targetTide);  //3.1.1.3
  return targetTide;
}
function fetchEachWthr_ (row) {
/**3.1.2 新規各行の必要な気候を取得 */
  let targetWeather = [];
  const rawW = UrlFetchApp.fetch(row.url_w).getContentText();
  // Logger.log(rawW); //3.1.2.1
  let wthrDaily = Parser.data(rawW).from('<tr class="mtx" style="text-align:right;">').to('</tr>').iterate();
  // Logger.log(wthrDaily);  //3.1.2.2
  for (let wthrHourly of wthrDaily) {
    /**
     * replaceを駆使して連想配列にする+気象庁ページが当日1時～24時（翌日0時）という仕様のため
     * v0仕様：0時は対象外、気象庁サイトの構造変化があればここも対応する必要あり。
     */
    let each_weather = {"id": row.id};  //ここに集める
    wthrHourly = wthrHourly.replace('<td style="white-space:nowrap">','{"time":');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', ', "pressure_land":');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', ', "pressure_sea":');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', ', "rainfall":"');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', '", "temperature":');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', ', "dpt":');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', ', "vapor_tension":');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', ', "humidity":');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', ', "wind_speed":');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0" style="text-align:center">', ', "wind_dir":"');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', '", "daylight":"+');    
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', '", "gsr":"+');       
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', '", "snowfall":"');    
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">', '", "snow_cover":"');    
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0"><img src="../../data/image/tenki/large/', '", "wthr":"');
    wthrHourly = wthrHourly.replace(/F.*alt="/, "");
    wthrHourly = wthrHourly.replace('"></td><td class="data_0_0">','", "cloud_cover":0');
    wthrHourly = wthrHourly.replace('</td><td class="data_0_0">',', "range_of_visibility":');
    wthrHourly = wthrHourly.replace('</td>','}');
    // Logger.log(wthrHourly); //3.1.2.3
    wthrHourly = JSON.parse(wthrHourly);
    // Logger.log(wthrHourly); //3.1.2.4
    if (wthrHourly.time >= row.start && wthrHourly.time <= row.end) {
      each_weather.time = wthrHourly.time;
      each_weather.temperature = wthrHourly.temperature;
      each_weather.wind_speed = wthrHourly.wind_speed;
      each_weather.wind_dir = wthrHourly.wind_dir;
      each_weather.pressure_land = wthrHourly.pressure_land;
      each_weather.wthr = wthrHourly.wthr;

      targetWeather.push(each_weather);
    }
  }
  Logger.log(targetWeather);  //3.1.2.5
  return targetWeather;
}

function confirmId (headerIdx, urlToWatch) {
/**4  inputシートに新規id取得=trueを書き戻す*/
  let table = inputSheet.getRange(headerRow+1, 1, inputSheet.getLastRow()-headerRow, inputSheet.getLastColumn()).getValues();
  for (let row of table) {
    for (let eachNew of urlToWatch) {
      if (row[headerIdx.id] == eachNew.id) {
        row[headerIdx.fetched] = true;
      }
    }
  }
  inputSheet.getRange(headerRow+1, 1, table.length, table[0].length).setValues(table);
}


 */
