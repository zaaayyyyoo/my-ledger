<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

type Bill = { id: number; type: 'income' | 'expense'; title: string; amount: number; date: string };
type Range = 'all' | 'today' | 'week' | 'month' | 'custom';
type CalendarCell = { key: string; value: string; day: number; inMonth: boolean };
const filterOptions: [Range, string][] = [['all','全部'],['today','今天'],['week','近7天'],['month','本月'],['custom','自定义范围']];
const API = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const STORAGE = 'daily_expenses_records';
const MIGRATED = `daily_ledger_migrated_${API}`;
const bills = ref<Bill[]>([]);
const title = ref('');
const amount = ref('');
const date = ref(today());
const type = ref<'income' | 'expense'>('expense');
const range = ref<Range>('all');
const start = ref(today());
const end = ref(today());
const query = ref('');
const page = ref(1);
const total = ref(0);
const summary = ref({ income: 0, expense: 0 });
const pageSize = 50;
const busy = ref(false);
const error = ref('');
const calendarOpen = ref(false);
const calendarMonth = ref(new Date());
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function localRead(): Bill[] {
  try { return JSON.parse(localStorage.getItem(STORAGE) || '[]'); }
  catch { return []; }
}
function dateParams() {
  const p = new URLSearchParams();
  if (query.value.trim()) p.set('q', query.value.trim());
  if (range.value === 'today') { p.set('start', today()); p.set('end', today()); }
  if (range.value === 'week') {
    const d = new Date(); d.setDate(d.getDate()-6);
    p.set('start', formatDate(d)); p.set('end', today());
  }
  if (range.value === 'month') p.set('start', today().slice(0,7)+'-01');
  if (range.value === 'custom') {
    if (start.value) p.set('start', start.value);
    if (end.value) p.set('end', end.value);
  }
  return p;
}
function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function matchesDate(d: string) {
  if (range.value === 'today') return d === today();
  if (range.value === 'week') {
    const from = new Date(); from.setDate(from.getDate()-6);
    return d >= formatDate(from) && d <= today();
  }
  if (range.value === 'month') return d.slice(0,7) === today().slice(0,7);
  if (range.value === 'custom') return (!start.value || d >= start.value) && (!end.value || d <= end.value);
  return true;
}
async function load() {
  busy.value = true; error.value = '';
  try {
    if (!API) {
      const q = query.value.trim().toLocaleLowerCase();
      const filtered = localRead().filter(b => (!q || b.title.toLocaleLowerCase().includes(q)) && matchesDate(b.date))
        .sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id);
      total.value = filtered.length;
      summary.value = filtered.reduce((s,b) => {
        s[b.type] += b.amount;
        return s;
      }, { income: 0, expense: 0 });
      bills.value = filtered.slice((page.value-1)*pageSize, page.value*pageSize);
      return;
    }
    const p = dateParams();
    const listParams = new URLSearchParams(p);
    listParams.set('page', String(page.value));
    listParams.set('page_size', String(pageSize));
    const [health, listRes, summaryRes] = await Promise.all([
      fetch(`${API}/api/health`),
      fetch(`${API}/api/bills?${listParams}`),
      fetch(`${API}/api/summary?${p}`)
    ]);
    if (!health.ok) throw new Error('后端连接检查失败');
    if (!listRes.ok || !summaryRes.ok) throw new Error('加载账单失败');
    const [data, sums] = await Promise.all([listRes.json(), summaryRes.json()]);
    bills.value = data.items;
    total.value = data.total;
    summary.value = sums;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally { busy.value = false; }
}
async function addBill() {
  const value = Number(amount.value);
  if (!title.value.trim() || !Number.isFinite(value) || value <= 0) return;
  const bill: Bill = {
    id: Date.now(), type: type.value, title: title.value.trim(),
    amount: Math.round(value*100)/100, date: date.value
  };
  busy.value = true; error.value = '';
  try {
    if (API) {
      const r = await fetch(`${API}/api/bills`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(bill)
      });
      if (!r.ok) throw new Error('保存账单失败');
    } else {
      const all = localRead(); all.push(bill);
      localStorage.setItem(STORAGE, JSON.stringify(all));
    }
    title.value = ''; amount.value = ''; page.value = 1; await load();
  } catch (e) { error.value = e instanceof Error ? e.message : '保存失败'; }
  finally { busy.value = false; }
}
async function removeBill(id: number) {
  if (!confirm('确定删除这笔记录吗？')) return;
  try {
    if (API) {
      const r = await fetch(`${API}/api/bills/${id}`, {method:'DELETE'});
      if (!r.ok) throw new Error('删除账单失败');
    } else {
      localStorage.setItem(STORAGE, JSON.stringify(localRead().filter(b => b.id !== id)));
    }
    if (bills.value.length === 1 && page.value > 1) page.value--;
    await load();
  } catch (e) { error.value = e instanceof Error ? e.message : '删除失败'; }
}
function setRange(v: Range) { range.value = v; page.value = 1; void load(); }
function onSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; void load(); }, 220);
}
const pages = computed(() => Math.max(1, Math.ceil(total.value/pageSize)));
const money = (n:number) => new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',minimumFractionDigits:2}).format(n);
const net = computed(() => summary.value.income-summary.value.expense);
const rangeLabel = computed(() => ({
  all: '全部流水', today: '今日流水', week: '近 7 天', month: '本月', custom: '自定义期间'
}[range.value] + (query.value.trim() ? ` · “${query.value.trim()}”` : '')));
const monthTitle = computed(() => `${calendarMonth.value.getFullYear()}年 ${calendarMonth.value.getMonth()+1}月`);
const calendarCells = computed<CalendarCell[]>(() => {
  const y=calendarMonth.value.getFullYear(), m=calendarMonth.value.getMonth();
  const first=new Date(y,m,1).getDay();
  const count=new Date(y,m+1,0).getDate();
  const prevCount=new Date(y,m,0).getDate();
  return Array.from({length:42},(_,i) => {
    const day=i-first+1;
    const d=day<1 ? new Date(y,m-1,prevCount+day) : day>count ? new Date(y,m+1,day-count) : new Date(y,m,day);
    return {key:formatDate(d),value:formatDate(d),day:d.getDate(),inMonth:day>=1 && day<=count};
  });
});
function openCalendar() { calendarMonth.value = new Date(`${date.value}T12:00:00`); calendarOpen.value = true; }
function moveMonth(step: number) {
  calendarMonth.value = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth()+step, 1);
}
function chooseDate(value: string) { date.value = value; calendarOpen.value = false; }
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') calendarOpen.value = false; }
function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch] || ch));
}
const highlighted = (value: string) => {
  const safe = escapeHtml(value);
  const q = query.value.trim();
  if (!q) return safe;
  const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<mark>$1</mark>');
};
async function migrateIfNeeded() {
  if (!API || localStorage.getItem(MIGRATED)) return;
  const old = localRead();
  if (!old.length) return;
  try {
    const r = await fetch(`${API}/api/bills?page=1&page_size=1`);
    if (!r.ok) return;
    const data = await r.json();
    if (data.total === 0) {
      const imported = await fetch(`${API}/api/bills/import`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({bills:old})
      });
      if (!imported.ok) return;
    }
    localStorage.setItem(MIGRATED, 'done');
  } catch { /* Retain local data and retry on the next launch. */ }
}
onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  await migrateIfNeeded(); await load();
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  if (searchTimer) clearTimeout(searchTimer);
});
</script>

<template>
  <main class="shell">
    <header class="top">
      <div><p class="eyebrow">DAILY LEDGER</p><h1>财务概览</h1></div>
      <span class="mode"><i></i>{{ API ? '云端同步' : '本机离线' }}</span>
    </header>

    <section class="summary" aria-label="收支汇总">
      <article class="summary-card">
        <span class="summary-label"><i class="dot green"></i>总收入</span>
        <strong class="income">{{ money(summary.income) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label"><i class="dot coral"></i>总支出</span>
        <strong class="expense">{{ money(summary.expense) }}</strong>
      </article>
      <article class="summary-card balance-card">
        <span class="summary-label"><i class="dot violet"></i>结余</span>
        <strong :class="net >= 0 ? 'balance-positive' : 'balance-negative'">{{ money(net) }}</strong>
      </article>
    </section>

    <section class="panel entry-panel">
      <div class="panel-heading"><div><span class="section-kicker">NEW TRANSACTION</span><h2>记一笔</h2></div></div>
      <form @submit.prevent="addBill">
        <div class="switch" role="group" aria-label="收支类型">
          <button type="button" :class="{active:type==='expense', 'expense-tab':type==='expense'}" @click="type='expense'">支出</button>
          <button type="button" :class="{active:type==='income', 'income-tab':type==='income'}" @click="type='income'">收入</button>
        </div>
        <label class="field-label" for="bill-title">项目名称</label>
        <input id="bill-title" v-model="title" class="text-field" :placeholder="type==='expense'?'例如：午餐、地铁':'例如：工资、兼职收入'" maxlength="200" required />
        <div class="amount-date-row">
          <div class="amount-field">
            <label class="field-label" for="bill-amount">金额</label>
            <div class="amount-input"><span>¥</span><input id="bill-amount" v-model="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required /></div>
          </div>
          <div class="date-field">
            <span class="field-label">记账日期</span>
            <button type="button" class="date-trigger" @click="openCalendar"><span>{{ date === today() ? `今天 · ${date.slice(5)}` : date }}</span><span class="calendar-icon">▦</span></button>
          </div>
        </div>
        <button class="primary" :disabled="busy"><span>记下这笔{{ type==='income'?'收入':'支出' }}</span><span aria-hidden="true">→</span></button>
      </form>
    </section>

    <section class="panel records-panel">
      <div class="records-heading">
        <div><span class="section-kicker">YOUR ACTIVITY</span><h2>明细流水 <span class="record-count">{{ total }}</span></h2></div>
        <span class="range-badge">{{ rangeLabel }}</span>
      </div>
      <div class="search-box">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input v-model="query" placeholder="搜索项目关键词" aria-label="搜索账单" @input="onSearch" @keyup.enter="page=1;load()" />
        <button v-if="query" class="clear-search" type="button" aria-label="清除搜索" @click="query='';onSearch()">×</button>
      </div>
      <nav class="filters" aria-label="按日期筛选">
        <button v-for="item in filterOptions" :key="item[0]" :class="{selected:range===item[0]}" @click="setRange(item[0])">{{ item[1] }}</button>
      </nav>
      <div v-if="range==='custom'" class="date-range">
        <label><span>从</span><input v-model="start" type="date" aria-label="开始日期" @change="page=1;load()" /></label>
        <span class="range-separator">—</span>
        <label><span>至</span><input v-model="end" type="date" aria-label="结束日期" @change="page=1;load()" /></label>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div v-if="busy && !bills.length" class="empty-state"><span class="empty-icon">◷</span><p>正在加载账单…</p></div>
      <ul v-else-if="bills.length" class="list">
        <li v-for="bill in bills" :key="bill.id" class="bill-row">
          <div class="bill-icon" :class="bill.type">{{ bill.type==='income'?'↙':'↗' }}</div>
          <div class="bill-name"><b v-html="highlighted(bill.title)"></b><time>{{ bill.date }}</time></div>
          <strong :class="['bill-amount',bill.type]">{{ bill.type==='income'?'+':'−' }}{{ money(bill.amount) }}</strong>
          <button class="delete" aria-label="删除账单" title="删除" @click="removeBill(bill.id)">×</button>
        </li>
      </ul>
      <div v-else class="empty-state"><span class="empty-icon">＋</span><p>{{ query || range!=='all' ? '没有找到符合条件的记录' : '暂无记录，记下第一笔收支吧' }}</p></div>
      <footer v-if="pages>1" class="pagination"><button :disabled="page<=1" @click="page--;load()">上一页</button><span>{{ page }} / {{ pages }}</span><button :disabled="page>=pages" @click="page++;load()">下一页</button></footer>
    </section>
    <p class="note">{{ API ? '收支数据已连接至你的账本服务' : '离线模式下，账单仅保存在这台设备' }}</p>

    <div v-if="calendarOpen" class="calendar-overlay" @click.self="calendarOpen=false">
      <section class="calendar-dialog" role="dialog" aria-modal="true" aria-label="选择记账日期">
        <header class="calendar-header">
          <button type="button" aria-label="上个月" @click="moveMonth(-1)">‹</button>
          <strong>{{ monthTitle }}</strong>
          <button type="button" aria-label="下个月" @click="moveMonth(1)">›</button>
        </header>
        <div class="weekdays"><span v-for="day in ['日','一','二','三','四','五','六']" :key="day">{{ day }}</span></div>
        <div class="calendar-grid">
          <button v-for="cell in calendarCells" :key="cell.key" type="button" :class="{muted:!cell.inMonth, today:cell.value===today(), chosen:cell.value===date}" @click="chooseDate(cell.value)">{{ cell.day }}</button>
        </div>
        <footer class="calendar-footer"><button type="button" class="cancel-date" @click="calendarOpen=false">取消</button><button type="button" class="today-date" @click="chooseDate(today())">回到今天</button></footer>
      </section>
    </div>
  </main>
</template>
