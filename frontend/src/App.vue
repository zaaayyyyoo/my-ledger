<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

type Bill = { id: number; type: 'income' | 'expense'; title: string; amount: number; date: string };
type Range = 'all' | 'today' | 'week' | 'month' | 'custom';
const filterOptions: [Range, string][] = [['all','全部'],['today','今天'],['week','近7天'],['month','本月'],['custom','自定义']];
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
const pageSize = 50;
const busy = ref(false);
const error = ref('');

function today() { return new Date().toLocaleDateString('sv-SE'); }
function localRead(): Bill[] {
  try {
    const value = localStorage.getItem(STORAGE);
    return JSON.parse(value || '[]');
  } catch { return []; }
}
function params() {
  const p = new URLSearchParams({ page: String(page.value), page_size: String(pageSize) });
  if (query.value.trim()) p.set('q', query.value.trim());
  if (range.value === 'today') { p.set('start', today()); p.set('end', today()); }
  if (range.value === 'week') {
    const d = new Date(); d.setDate(d.getDate() - 6);
    p.set('start', d.toLocaleDateString('sv-SE')); p.set('end', today());
  }
  if (range.value === 'month') p.set('start', today().slice(0, 7) + '-01');
  if (range.value === 'custom') { p.set('start', start.value); p.set('end', end.value); }
  return p;
}
function inRange(d: string) {
  if (range.value === 'today') return d === today();
  if (range.value === 'week') { const x = new Date(); x.setDate(x.getDate()-6); return d >= x.toLocaleDateString('sv-SE') && d <= today(); }
  if (range.value === 'month') return d.slice(0,7) === today().slice(0,7);
  if (range.value === 'custom') return (!start.value || d >= start.value) && (!end.value || d <= end.value);
  return true;
}
async function load() {
  busy.value = true; error.value = '';
  try {
    if (!API) {
      const q = query.value.trim().toLowerCase();
      const filtered = localRead().filter(b => (!q || b.title.toLowerCase().includes(q)) && inRange(b.date));
      total.value = filtered.length;
      bills.value = filtered.sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id)
        .slice((page.value-1)*pageSize, page.value*pageSize);
      return;
    }
    const health = await fetch(`${API}/api/health`);
    if (!health.ok) throw new Error('后端健康检查失败');
    const res = await fetch(`${API}/api/bills?${params()}`);
    if (!res.ok) throw new Error('加载账单失败');
    const data = await res.json();
    bills.value = data.items; total.value = data.total;
  } catch (e) { error.value = e instanceof Error ? e.message : '加载失败'; }
  finally { busy.value = false; }
}
async function addBill() {
  if (!title.value.trim() || !Number(amount.value) || Number(amount.value) <= 0) return;
  const bill: Bill = { id: Date.now(), type: type.value, title: title.value.trim(), amount: Math.round(Number(amount.value)*100)/100, date: date.value };
  busy.value = true; error.value = '';
  try {
    if (API) {
      const r = await fetch(`${API}/api/bills`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(bill) });
      if (!r.ok) throw new Error('保存账单失败');
    } else { const all = localRead(); all.push(bill); localStorage.setItem(STORAGE, JSON.stringify(all)); }
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
      const all = localRead().filter(b => b.id !== id);
      localStorage.setItem(STORAGE, JSON.stringify(all));
    }
    await load();
  } catch (e) { error.value = e instanceof Error ? e.message : '删除失败'; }
}
function setRange(v: Range) { range.value = v; page.value = 1; void load(); }
const income = computed(() => bills.value.filter(b=>b.type==='income').reduce((s,b)=>s+b.amount,0));
const expense = computed(() => bills.value.filter(b=>b.type==='expense').reduce((s,b)=>s+b.amount,0));
const pages = computed(() => Math.max(1, Math.ceil(total.value/pageSize)));
const money = (n:number) => new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(n);
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
  } catch { /* Keep local data and retry on the next launch. */ }
}
onMounted(async () => { await migrateIfNeeded(); await load(); });
</script>

<template>
  <main class="shell">
    <header class="top"><div><p class="eyebrow">DAILY LEDGER</p><h1>财务概览</h1></div><span class="mode">{{ API ? '云端同步' : '离线模式' }}</span></header>
    <section class="summary">
      <article><span>本页收入</span><strong class="income">{{ money(income) }}</strong></article>
      <article><span>本页支出</span><strong class="expense">{{ money(expense) }}</strong></article>
      <article><span>本页结余</span><strong>{{ money(income-expense) }}</strong></article>
    </section>
    <form class="panel entry" @submit.prevent="addBill">
      <div class="switch"><button type="button" :class="{active:type==='expense'}" @click="type='expense'">支出</button><button type="button" :class="{active:type==='income'}" @click="type='income'">收入</button></div>
      <div class="fields"><input v-model="title" placeholder="项目名称（如：午餐、地铁）" required /><input v-model="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="金额 ¥" required /><input v-model="date" type="date" required /></div>
      <button class="primary" :disabled="busy">记一笔{{ type==='income'?'收入':'支出' }}</button>
    </form>
    <section class="panel records">
      <div class="toolbar"><h2>明细流水 <small>{{ total }} 笔</small></h2><input v-model="query" @input="page=1;load()" placeholder="搜索项目" /></div>
      <nav class="filters">
        <button v-for="item in filterOptions" :key="item[0]" :class="{selected:range===item[0]}" @click="setRange(item[0])">{{ item[1] }}</button>
      </nav>
      <div v-if="range==='custom'" class="date-range"><input v-model="start" type="date" @change="page=1;load()" /><span>至</span><input v-model="end" type="date" @change="page=1;load()" /></div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="busy && !bills.length" class="empty">正在加载…</p>
      <ul v-else-if="bills.length" class="list">
        <li v-for="bill in bills" :key="bill.id"><div class="bill-name"><b>{{ bill.title }}</b><time>{{ bill.date }}</time></div><strong :class="bill.type">{{ bill.type==='income'?'+':'−' }}{{ money(bill.amount) }}</strong><button class="delete" aria-label="删除" @click="removeBill(bill.id)">×</button></li>
      </ul>
      <p v-else class="empty">暂无记录，记下第一笔收支吧。</p>
      <footer class="pagination"><button :disabled="page<=1" @click="page--;load()">上一页</button><span>{{ page }} / {{ pages }}</span><button :disabled="page>=pages" @click="page++;load()">下一页</button></footer>
    </section>
    <p class="note">未配置后端时，账单仅保存在本机。</p>
  </main>
</template>
