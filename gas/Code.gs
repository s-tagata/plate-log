/**
 * Plate Log — ウエイトトレーニング記録(サーバー側 / Google Apps Script)
 * 画面(アプリ)は GitHub Pages、データはこのスプレッドシートに集まる。
 * Webアプリとして「アクセスできるユーザー:全員」で公開し、/exec のURLをアプリの config.js に書く。
 *
 * シート構成(初回の setup() で自動作成)
 *   選手      : A列に選手名(2行目から)。ここにある名前だけが選択・保存できる
 *   セッション : 1回のトレーニング = 1行(体重・体調・セッションRPE・総挙上量など)
 *   記録      : 1セット = 1行(重量・回数・推定1RM など。集計・ピボット用)
 */

const SHEET_ROSTER = '選手';
const SHEET_SESS = 'セッション';
const SHEET_SETS = '記録';
const SHEET_MENU = 'メニュー';

const SESS_HEAD = ['記録ID', '送信日時', '選手', '日付', 'Day', 'Week', '体重kg', '体調', 'セッションRPE',
  '総挙上量kg', 'セット数', 'コレクティブ実施', 'コメント', '送信アカウント', 'データ(JSON)'];
const SETS_HEAD = ['記録ID', '送信日時', '選手', '日付', 'Day', 'Week', '体重kg', '体調', 'セッションRPE',
  'ブロック', '区分', '種目', '種別', 'セット', '重量kg', '回数', '推定1RM', '挙上量kg', '実施', 'コメント'];
const CATS = { cor: 'コレクティブ', pow: 'パワー', str: 'ストレングス' };

/** チームタブを見られる人。このスクリプトの所有者(コーチ)は常に含まれる。
 *  他のスタッフを加える場合はメールアドレスを追加する。例: ['staff@example.com'] */
const COACH_EMAILS = [];
/** 管理者パスコード:シート「設定」のB1に入れる。アプリ下部の「管理者ログイン」で入力すると、
 *  どのGoogleアカウントでもチーム・メニュータブが使えるようになる。空欄なら無効。 */
const SHEET_CONF = '設定';

/* ---------- 入口 ---------- */
/** アプリ(GitHub Pages)からの呼び出し。本文は {fn, args, team} のJSON */
function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e && e.postData && e.postData.contents || '{}');
    out = { ok: true, data: api(req) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** 呼び出せる関数の一覧(ここにないものは外から呼べない) */
const API = {
  getInit: getInit_, getHistory: getHistory_, saveSession: saveSession_, deleteSession: deleteSession_,
  getTeam: getTeam_, saveProgram: saveProgram_, getProgramHistory: getProgramHistory_
};

/** google.script.run と doPost の共通入口。チームパスコードを確認してから処理する */
function api(req) {
  req = req || {};
  const fn = API[req.fn];
  if (!fn) throw new Error('不明な操作です');
  checkTeam_(req.team);
  return fn.apply(null, Array.isArray(req.args) ? req.args : []);
}

function checkTeam_(code) {
  const conf = ss_().getSheetByName(SHEET_CONF);
  const pass = conf ? String(conf.getRange('B2').getDisplayValue()).trim() : '';
  if (pass && String(code || '').trim() !== pass) throw new Error('TEAM_CODE');
}

/** 旧URL(Apps Scriptの画面)も引き続き使える */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Plate Log')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** 最初に一度だけ、スクリプトエディタから実行する */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  ensureSheets_(ss);
}

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('初期設定が済んでいません。コーチに setup の実行を依頼してください');
  return ss;
}

function ensureSheets_(ss) {
  sheet_(ss, SHEET_ROSTER, ['名前']);
  const s = sheet_(ss, SHEET_SESS, SESS_HEAD);
  s.getRange('A:A').setNumberFormat('@');
  s.getRange('O:O').setNumberFormat('@');
  sheet_(ss, SHEET_SETS, SETS_HEAD).getRange('A:A').setNumberFormat('@');
  sheet_(ss, SHEET_MENU, ['更新日時', '更新者', '変更内容', 'データ(JSON)']).getRange('D:D').setNumberFormat('@');
  const conf = ss.getSheetByName(SHEET_CONF) || ss.insertSheet(SHEET_CONF);
  if (conf.getRange('A2').getValue() !== 'チームパスコード') {
    conf.getRange('A1:A4').setValues([['管理者パスコード'], ['チームパスコード'], [''],
      ['B1:アプリ下部の「管理者ログイン」で入力すると、チーム・メニュータブが使える(4文字以上。空欄なら無効)\nB2:アプリを初めて開いたときに全員が入力する。空欄ならパスコードなしで使える']]);
    conf.getRange('A1:A2').setFontWeight('bold');
    conf.getRange('B1:B2').setNumberFormat('@').setBackground('#fff3c4');
  }
}

function sheet_(ss, name, head) {
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

/* ---------- クライアントから呼ばれる関数 ---------- */
function getInit_(code) {
  const ss = ss_();
  ensureSheets_(ss);
  return { roster: roster_(ss), isCoach: isCoach_(code), adminByCode: !!code && isCoach_(code), program: latestProgram_(ss) };
}

function getHistory_(player) {
  const ss = ss_();
  checkPlayer_(ss, player);
  const s = ss.getSheetByName(SHEET_SESS);
  const n = s.getLastRow() - 1;
  if (n < 1) return [];
  const rows = s.getRange(2, 1, n, SESS_HEAD.length).getValues();
  const out = [];
  rows.forEach(r => {
    if (String(r[2]) !== player) return;
    try {
      const doc = JSON.parse(r[14]);
      doc.id = String(r[0]);
      out.push(doc);
    } catch (e) { /* 壊れた行は読み飛ばす */ }
  });
  return out;
}

function saveSession_(player, id, doc) {
  const ss = ss_();
  checkPlayer_(ss, player);
  id = cleanId_(id);
  doc = cleanDoc_(doc);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sess = ss.getSheetByName(SHEET_SESS);
    const sets = ss.getSheetByName(SHEET_SETS);
    // 編集時は同じIDの行を入れ替える(他の選手のIDは触らない)
    const owner = ownerOf_(sess, id);
    if (owner && owner !== player) throw new Error('この記録は編集できません');
    deleteRows_(sess, id);
    deleteRows_(sets, id);

    const now = new Date();
    const email = Session.getActiveUser().getEmail() || '';
    const head = [doc.date, 'Day ' + doc.day, doc.week, doc.bw === null ? '' : doc.bw, doc.cond, doc.rpe === null ? '' : doc.rpe];

    let volume = 0, nsets = 0, corDone = 0, corAll = 0;
    const setRows = [];
    let first = true;
    doc.exercises.forEach(e => {
      const base = [id, now, player].concat(head, [e.block || '', CATS[e.cat] || '', e.name, e.tag || '']);
      if (!e.sets) {
        corAll++; if (e.done) corDone++;
        setRows.push(base.concat(['', '', '', '', '', e.done ? '済' : '未', first ? doc.note : '']));
        first = false;
        return;
      }
      e.sets.forEach((x, j) => {
        const wup = e.tag === 'W-up';
        const est = wup ? 0 : e1rm_(x.w, x.r);
        const v = x.w * x.r;
        if (!wup) volume += v;
        nsets++;
        setRows.push(base.concat([j + 1, x.w, x.r, est ? Math.round(est * 10) / 10 : '', v, '済', first ? doc.note : '']));
        first = false;
      });
    });

    sess.appendRow([id, now, player].concat(head, [volume, nsets, corAll ? corDone + '/' + corAll : '', doc.note, email, JSON.stringify(doc)]));
    if (setRows.length) {
      sets.getRange(sets.getLastRow() + 1, 1, setRows.length, SETS_HEAD.length).setValues(setRows);
    }
  } finally {
    lock.releaseLock();
  }
  return true;
}

function deleteSession_(player, id) {
  const ss = ss_();
  checkPlayer_(ss, player);
  id = cleanId_(id);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sess = ss.getSheetByName(SHEET_SESS);
    const owner = ownerOf_(sess, id);
    if (owner !== player) throw new Error('この記録は削除できません');
    deleteRows_(sess, id);
    deleteRows_(ss.getSheetByName(SHEET_SETS), id);
  } finally {
    lock.releaseLock();
  }
  return true;
}

/** コーチ用:全選手の記録 */
function getTeam_(code) {
  if (!isCoach_(code)) throw new Error('チームの記録はコーチのみ閲覧できます');
  const ss = ss_();
  const roster = roster_(ss);
  const players = {};
  roster.forEach(n => players[n] = []);
  const s = ss.getSheetByName(SHEET_SESS);
  const n = s.getLastRow() - 1;
  if (n > 0) {
    s.getRange(2, 1, n, SESS_HEAD.length).getValues().forEach(r => {
      const name = String(r[2]);
      if (!players[name]) return;
      try { const doc = JSON.parse(r[14]); doc.id = String(r[0]); players[name].push(doc); } catch (e) {}
    });
  }
  return { roster: roster, players: players };
}

/* ---------- メニュー(コーチのみ更新) ---------- */
function saveProgram_(p, note, code) {
  if (!isCoach_(code)) throw new Error('メニューの更新はコーチのみできます');
  const ss = ss_();
  ensureSheets_(ss);
  const clean = cleanProgram_(p);
  const now = new Date();
  clean.version = String(now.getTime());
  const s = ss.getSheetByName(SHEET_MENU);
  s.appendRow([now, Session.getActiveUser().getEmail() || (code ? 'パスコード' : ''), String(note || '').slice(0, 200), JSON.stringify(clean)]);
  return clean;
}

function getProgramHistory_(code) {
  if (!isCoach_(code)) throw new Error('コーチのみ閲覧できます');
  const s = ss_().getSheetByName(SHEET_MENU);
  if (!s) return [];
  const n = s.getLastRow() - 1;
  if (n < 1) return [];
  const from = Math.max(2, s.getLastRow() - 14);
  const tz = Session.getScriptTimeZone();
  return s.getRange(from, 1, s.getLastRow() - from + 1, 4).getValues().reverse().map(r => {
    let data = null; try { data = JSON.parse(r[3]); } catch (e) {}
    return { at: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy/MM/dd HH:mm') : String(r[0]), note: String(r[2] || ''), data: data };
  }).filter(h => h.data);
}

function latestProgram_(ss) {
  const s = ss.getSheetByName(SHEET_MENU);
  if (!s || s.getLastRow() < 2) return null;
  try { return JSON.parse(s.getRange(s.getLastRow(), 4).getValue()); } catch (e) { return null; }
}

function cleanProgram_(p) {
  if (!p || typeof p.program !== 'object') throw new Error('メニューの形式が不正です');
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const keys = Object.keys(p.program).filter(k => /^[1-9]$/.test(k)).sort();
  if (!keys.length) throw new Error('Dayが1つもありません');
  const program = {};
  keys.forEach((k, i) => {
    const d = p.program[k] || {};
    const blocks = (Array.isArray(d.blocks) ? d.blocks : []).slice(0, 15).map(b => {
      const cat = CATS[b.cat] ? b.cat : 'str';
      const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 12).map(l => {
        const o = { n: str(l.n, 60), r: str(l.r, 20), s: Math.max(1, Math.min(20, Math.round(Number(l.s)) || 1)) };
        if (cat !== 'cor') {
          if (str(l.w, 20)) o.w = str(l.w, 20);
          if (str(l.cue, 60)) o.cue = str(l.cue, 60);
          if (l.tag === 'W-up' || l.tag === 'Extra') o.tag = l.tag;
          if (l.opt) o.opt = 1; else if (l.hl) o.hl = 1;
          if (str(l.base, 60)) o.base = str(l.base, 60);
        }
        return o;
      }).filter(l => l.n);
      return { cat: cat, lines: lines };
    }).filter(b => b.lines.length);
    if (!blocks.length) throw new Error('Day ' + (i + 1) + ' に種目がありません');
    program[String(i + 1)] = {
      label: str(d.label, 20) || 'Day ' + (i + 1),
      sub: str(d.sub, 80),
      memo: (Array.isArray(d.memo) ? d.memo : []).slice(0, 6).map(m => str(m, 80)).filter(Boolean),
      blocks: blocks
    };
  });
  return { phase: str(p.phase, 20), goal: str(p.goal, 40), program: program };
}

/* ---------- 内部処理 ---------- */
function isCoach_(code) {
  const me = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (me && (me === owner || COACH_EMAILS.map(e => String(e).toLowerCase()).indexOf(me) >= 0)) return true;
  if (!code) return false;
  const conf = ss_().getSheetByName(SHEET_CONF);
  const pass = conf ? String(conf.getRange('B1').getDisplayValue()).trim() : '';
  return pass.length >= 4 && String(code).trim() === pass;
}

function roster_(ss) {
  const s = ss.getSheetByName(SHEET_ROSTER);
  const n = s.getLastRow() - 1;
  if (n < 1) return [];
  return s.getRange(2, 1, n, 1).getValues().map(r => String(r[0]).trim()).filter(Boolean);
}

function checkPlayer_(ss, player) {
  if (!player || roster_(ss).indexOf(player) < 0) throw new Error('名簿にない名前です。ページを再読み込みしてください');
}

function cleanId_(id) {
  id = String(id || '');
  if (!/^[a-z0-9]{6,40}$/i.test(id)) throw new Error('記録IDが不正です');
  return id;
}

function cleanDoc_(d) {
  if (!d || !Array.isArray(d.exercises)) throw new Error('記録の形式が不正です');
  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const str = (v, max) => String(v == null ? '' : v).slice(0, max);
  const date = str(d.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日付が不正です');
  return {
    v: 2,
    day: /^[1-9]$/.test(String(d.day)) ? String(d.day) : '1',
    week: Math.max(1, Math.round(num(d.week)) || 1),
    date: date,
    bw: num(d.bw) > 0 ? Math.round(num(d.bw) * 10) / 10 : null,
    cond: ['良い', '普通', '悪い'].indexOf(d.cond) >= 0 ? d.cond : '',
    rpe: num(d.rpe) >= 1 && num(d.rpe) <= 10 ? Math.round(num(d.rpe)) : null,
    note: str(d.note, 500),
    updatedAt: Date.now(),
    exercises: d.exercises.slice(0, 60).map(e => {
      const o = { name: str(e.name, 80), cat: CATS[e.cat] ? e.cat : 'str' };
      if (Array.isArray(e.sets)) {
        o.tag = e.tag === 'W-up' || e.tag === 'Extra' ? e.tag : '';
        o.block = Math.round(num(e.block)) || '';
        o.sets = e.sets.slice(0, 20).map(x => ({ w: Math.max(0, num(x.w)), r: Math.max(0, Math.round(num(x.r))) }));
      } else {
        o.done = !!e.done;
      }
      return o;
    })
  };
}

function e1rm_(w, r) {
  if (!w || !r || r > 12) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

function ownerOf_(sheet, id) {
  const hit = sheet.getRange('A:A').createTextFinder(id).matchEntireCell(true).findNext();
  return hit ? String(sheet.getRange(hit.getRow(), 3).getValue()) : null;
}

function deleteRows_(sheet, id) {
  const hits = sheet.getRange('A:A').createTextFinder(id).matchEntireCell(true).findAll();
  const rows = hits.map(h => h.getRow()).sort((a, b) => b - a);
  // 連続した行はまとめて削除する
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] === rows[j] - 1) j++;
    sheet.deleteRows(rows[j], i === j ? 1 : j - i + 1);
    i = j + 1;
  }
}
