const STORAGE_KEY = "salaryManagerFresh_v1";

const DEFAULT_STATE = {
  settings: {
    normalWage: 1200,
    specialWage: 1700,
    lateNightRate: 25,
    salaryGoal: 100000
  },
  works: []
};

let state = loadState();
let calendarCursor = new Date();
calendarCursor.setDate(1);
let selectedHistoryDate = "";

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    const saved = JSON.parse(raw);
    return {
      settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
      works: Array.isArray(saved.works) ? saved.works : []
    };
  } catch (e) {
    return cloneDefault();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateToYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function formatYen(value) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatMinutes(total) {
  total = Math.max(0, Math.round(total));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}時間${m}分`;
}

function timeLabel(h, m) {
  return `${pad(h)}:${pad(m)}`;
}

function makeId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fillTimeSelects(hourId, minuteId) {
  const hour = document.getElementById(hourId);
  const minute = document.getElementById(minuteId);
  hour.innerHTML = "";
  minute.innerHTML = "";

  for (let h = 0; h < 24; h++) {
    hour.add(new Option(pad(h), String(h)));
  }
  [0, 15, 30, 45].forEach(m => minute.add(new Option(pad(m), String(m))));
}

function blockType(work, absoluteMinute) {
  const minuteOfDay = ((absoluteMinute % 1440) + 1440) % 1440;

  // 特殊時給日は「勤務開始日の22:00〜翌02:00」が特殊時給。
  if (
    work.wageType === "special" &&
    absoluteMinute >= 22 * 60 &&
    absoluteMinute < 26 * 60
  ) {
    return "special";
  }

  // 通常の深夜帯 22:00〜翌05:00。
  if (minuteOfDay >= 22 * 60 || minuteOfDay < 5 * 60) {
    return "late";
  }

  return "normal";
}

function calculateWork(work) {
  let start = Number(work.startHour) * 60 + Number(work.startMinute);
  let end = Number(work.endHour) * 60 + Number(work.endMinute);

  if (end <= start) end += 1440;

  const blocks = [];
  for (let t = start; t < end; t += 15) {
    blocks.push({ type: blockType(work, t) });
  }

  let breakLeft = Number(work.breakMinutes || 0);

  // 休憩は単価の安い時間から差し引く。
  const normalRate = Number(state.settings.normalWage);
  const lateRate = normalRate * (1 + Number(state.settings.lateNightRate) / 100);
  const specialRate = Number(state.settings.specialWage);

  const rateFor = type => {
    if (type === "special") return specialRate;
    if (type === "late") return lateRate;
    return normalRate;
  };

  const removable = blocks
    .map((block, index) => ({ index, rate: rateFor(block.type) }))
    .sort((a, b) => a.rate - b.rate);

  const removeCount = Math.min(Math.floor(breakLeft / 15), blocks.length);
  const removed = new Set(removable.slice(0, removeCount).map(x => x.index));

  let salary = 0;
  let paidBlocks = 0;

  blocks.forEach((block, index) => {
    if (removed.has(index)) return;
    salary += rateFor(block.type) / 4;
    paidBlocks++;
  });

  return {
    salary: Math.round(salary),
    minutes: paidBlocks * 15,
    rawMinutes: end - start
  };
}

function monthlySummary(monthKey) {
  const works = state.works.filter(w => w.date.startsWith(monthKey));
  const dates = new Set();
  let salary = 0;
  let minutes = 0;

  works.forEach(work => {
    const result = calculateWork(work);
    salary += result.salary;
    minutes += result.minutes;
    dates.add(work.date);
  });

  return { salary, minutes, days: dates.size, works };
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function showPage(name) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.getElementById(`page-${name}`).classList.add("active");

  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.go === name);
  });

  if (name === "home") renderHome();
  if (name === "work") updateWorkPreview();
  if (name === "history") renderCalendar();
  if (name === "salary") renderSalaryPage();
  if (name === "settings") loadSettingsForm();

  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderHome() {
  const month = currentMonthKey();
  const summary = monthlySummary(month);
  const goal = Number(state.settings.salaryGoal) || 0;
  const rawRate = goal > 0 ? (summary.salary / goal) * 100 : 0;
  const progress = Math.min(100, Math.max(0, rawRate));
  const remaining = Math.max(0, goal - summary.salary);

  document.getElementById("homeMonthLabel").textContent =
    `${Number(month.slice(5))}月`;
  document.getElementById("homeSalary").textContent = formatYen(summary.salary);
  document.getElementById("homeGoal").textContent = formatYen(goal);
  document.getElementById("goalProgress").style.width = `${progress}%`;
  document.getElementById("goalRate").textContent = `達成率 ${rawRate.toFixed(1)}%`;
  document.getElementById("goalRemaining").textContent =
    summary.salary >= goal && goal > 0 ? "目標達成" : `あと ${formatYen(remaining)}`;
  document.getElementById("homeDays").textContent = `${summary.days}日`;
  document.getElementById("homeHours").textContent = formatMinutes(summary.minutes);
}

function setWageType(type) {
  document.getElementById("wageType").value = type;
  document.getElementById("normalDayBtn").classList.toggle("active", type === "normal");
  document.getElementById("specialDayBtn").classList.toggle("active", type === "special");
  updateWorkPreview();
}

function workFormValue() {
  return {
    date: document.getElementById("workDate").value,
    wageType: document.getElementById("wageType").value,
    startHour: Number(document.getElementById("startHour").value),
    startMinute: Number(document.getElementById("startMinute").value),
    endHour: Number(document.getElementById("endHour").value),
    endMinute: Number(document.getElementById("endMinute").value),
    breakMinutes: Number(document.getElementById("breakMinutes").value)
  };
}

function updateWorkPreview() {
  const box = document.getElementById("workPreview");
  if (!box) return;
  const work = workFormValue();
  const result = calculateWork(work);
  box.innerHTML = `
    <strong>給与見込み ${formatYen(result.salary)}</strong><br>
    勤務時間 ${formatMinutes(result.minutes)} ／
    ${work.wageType === "special" ? "特殊時給日" : "通常日"}
  `;
}

function registerWork() {
  const work = workFormValue();

  if (!work.date) {
    showToast("勤務日を選択してください");
    return;
  }

  const sameTime =
    work.startHour === work.endHour &&
    work.startMinute === work.endMinute;

  if (sameTime) {
    showToast("出勤と退勤を同じ時刻にはできません");
    return;
  }

  state.works.push({ id: makeId(), ...work });
  state.works.sort((a, b) => a.date.localeCompare(b.date));
  saveState();
  renderAll();
  showToast("勤務を登録しました");
  showPage("home");
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  document.getElementById("calendarTitle").textContent = `${year}年${month + 1}月`;

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  const firstWeekday = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("button");
    blank.className = "calendar-cell blank";
    grid.appendChild(blank);
  }

  for (let day = 1; day <= lastDay; day++) {
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;
    const hasWork = state.works.some(w => w.date === key);
    const button = document.createElement("button");
    button.className = "calendar-cell";
    if (hasWork) button.classList.add("has-work");
    if (selectedHistoryDate === key) button.classList.add("selected");
    button.textContent = day;
    button.addEventListener("click", () => {
      selectedHistoryDate = key;
      renderCalendar();
      renderHistoryDetail();
    });
    grid.appendChild(button);
  }

  renderHistoryDetail();
}

function renderHistoryDetail() {
  const detail = document.getElementById("historyDetail");

  if (!selectedHistoryDate) {
    detail.innerHTML = '<p class="muted center">日付を選択してください</p>';
    return;
  }

  const works = state.works.filter(w => w.date === selectedHistoryDate);
  detail.innerHTML = `<h2>${selectedHistoryDate.replaceAll("-", "/")}</h2>`;

  if (!works.length) {
    detail.innerHTML += '<p class="muted center">この日の勤務はありません</p>';
  } else {
    works.forEach(work => {
      const result = calculateWork(work);
      const record = document.createElement("div");
      record.className = "work-record";
      record.innerHTML = `
        <div class="work-record-top">
          <div>
            <strong>${timeLabel(work.startHour, work.startMinute)} 〜 ${timeLabel(work.endHour, work.endMinute)}</strong>
            <p>${work.wageType === "special" ? "特殊時給日" : "通常日"} ・ 休憩${work.breakMinutes}分</p>
            <p>${formatMinutes(result.minutes)} ・ ${formatYen(result.salary)}</p>
          </div>
          <button class="edit-link">編集</button>
        </div>
      `;
      record.querySelector(".edit-link").addEventListener("click", () => openEditModal(work.id));
      detail.appendChild(record);
    });
  }

  const addButton = document.createElement("button");
  addButton.className = "history-add-button";
  addButton.textContent = "＋ この日に勤務を追加";
  addButton.addEventListener("click", () => addWorkFromHistory(selectedHistoryDate));
  detail.appendChild(addButton);
}

function addWorkFromHistory(date) {
  if (!date) return;

  document.getElementById("workDate").value = date;
  setWageType("normal");
  document.getElementById("breakMinutes").value = "0";
  updateWorkPreview();
  showPage("work");
}

function openEditModal(id) {
  const work = state.works.find(w => w.id === id);
  if (!work) return;

  document.getElementById("editId").value = work.id;
  document.getElementById("editDate").value = work.date;
  document.getElementById("editWageType").value = work.wageType;
  document.getElementById("editStartHour").value = work.startHour;
  document.getElementById("editStartMinute").value = work.startMinute;
  document.getElementById("editEndHour").value = work.endHour;
  document.getElementById("editEndMinute").value = work.endMinute;
  document.getElementById("editBreakMinutes").value = work.breakMinutes;
  document.getElementById("editModal").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("editModal").classList.add("hidden");
}

function saveEdit() {
  const id = document.getElementById("editId").value;
  const work = state.works.find(w => w.id === id);
  if (!work) return;

  work.date = document.getElementById("editDate").value;
  work.wageType = document.getElementById("editWageType").value;
  work.startHour = Number(document.getElementById("editStartHour").value);
  work.startMinute = Number(document.getElementById("editStartMinute").value);
  work.endHour = Number(document.getElementById("editEndHour").value);
  work.endMinute = Number(document.getElementById("editEndMinute").value);
  work.breakMinutes = Number(document.getElementById("editBreakMinutes").value);

  saveState();
  closeEditModal();
  renderAll();
  showToast("勤務を更新しました");
}

function deleteEdit() {
  const id = document.getElementById("editId").value;
  if (!confirm("この勤務を削除しますか？")) return;
  state.works = state.works.filter(w => w.id !== id);
  saveState();
  closeEditModal();
  renderAll();
  showToast("勤務を削除しました");
}

function allMonthKeys() {
  return [...new Set(state.works.map(w => w.date.slice(0, 7)))].sort();
}

function renderSalaryPage() {
  const input = document.getElementById("salaryMonth");
  if (!input.value) input.value = currentMonthKey();
  const month = input.value;
  const summary = monthlySummary(month);
  const goal = Number(state.settings.salaryGoal) || 0;
  const rawRate = goal > 0 ? summary.salary / goal * 100 : 0;
  const progress = Math.min(100, Math.max(0, rawRate));

  document.getElementById("salaryTotal").textContent = formatYen(summary.salary);
  document.getElementById("salaryDays").textContent = `${summary.days}日`;
  document.getElementById("salaryHours").textContent = formatMinutes(summary.minutes);
  document.getElementById("salaryGoalRate").textContent = `${rawRate.toFixed(1)}%`;
  document.getElementById("salaryGoalProgress").style.width = `${progress}%`;
  document.getElementById("salaryGoalCurrent").textContent = formatYen(summary.salary);
  document.getElementById("salaryGoalTarget").textContent = `目標 ${formatYen(goal)}`;

  renderSalaryChart();
  renderMonthlyList();
}

function renderSalaryChart() {
  const chart = document.getElementById("salaryChart");
  chart.innerHTML = "";

  const months = allMonthKeys();
  if (!months.length) {
    chart.innerHTML = '<p class="muted center" style="width:100%">勤務を登録するとグラフが表示されます</p>';
    return;
  }

  const salaries = months.map(month => monthlySummary(month).salary);
  const max = Math.max(...salaries, 1);

  months.forEach((month, index) => {
    const value = salaries[index];
    const height = Math.max(3, value / max * 165);
    const item = document.createElement("div");
    item.className = "chart-item";
    item.innerHTML = `
      <div class="chart-value">${formatYen(value)}</div>
      <div class="chart-bar-wrap"><div class="chart-bar" style="height:${height}px"></div></div>
      <div class="chart-label">${Number(month.slice(5))}月</div>
    `;
    chart.appendChild(item);
  });
}

function renderMonthlyList() {
  const list = document.getElementById("monthlySalaryList");
  list.innerHTML = "";
  const months = allMonthKeys().reverse();
  const selected = document.getElementById("salaryMonth").value;

  if (!months.length) {
    list.innerHTML = '<p class="muted center">勤務データがありません</p>';
    return;
  }

  months.forEach(month => {
    const summary = monthlySummary(month);
    const row = document.createElement("div");
    row.className = "monthly-row";
    if (month === selected) row.classList.add("selected");
    row.innerHTML = `
      <div>
        ${month.replace("-", "年")}月
        <small>${summary.days}日 ・ ${formatMinutes(summary.minutes)}</small>
      </div>
      <strong>${formatYen(summary.salary)}</strong>
    `;
    row.addEventListener("click", () => {
      document.getElementById("salaryMonth").value = month;
      renderSalaryPage();
    });
    list.appendChild(row);
  });
}

function loadSettingsForm() {
  document.getElementById("normalWage").value = state.settings.normalWage;
  document.getElementById("specialWage").value = state.settings.specialWage;
  document.getElementById("lateNightRate").value = state.settings.lateNightRate;
  document.getElementById("salaryGoal").value = state.settings.salaryGoal;
}

function saveSettings() {
  state.settings.normalWage = Math.max(0, Number(document.getElementById("normalWage").value) || 0);
  state.settings.specialWage = Math.max(0, Number(document.getElementById("specialWage").value) || 0);
  state.settings.lateNightRate = Math.max(0, Number(document.getElementById("lateNightRate").value) || 0);
  state.settings.salaryGoal = Math.max(0, Number(document.getElementById("salaryGoal").value) || 0);
  saveState();
  renderAll();
  showToast("給与設定を保存しました");
}

function renderAll() {
  renderHome();
  renderCalendar();
  renderSalaryPage();
  loadSettingsForm();
  updateWorkPreview();
}

function init() {
  fillTimeSelects("startHour", "startMinute");
  fillTimeSelects("endHour", "endMinute");
  fillTimeSelects("editStartHour", "editStartMinute");
  fillTimeSelects("editEndHour", "editEndMinute");

  document.getElementById("workDate").value = dateToYmd(new Date());
  document.getElementById("startHour").value = "18";
  document.getElementById("startMinute").value = "0";
  document.getElementById("endHour").value = "22";
  document.getElementById("endMinute").value = "0";
  document.getElementById("breakMinutes").value = "0";
  document.getElementById("salaryMonth").value = currentMonthKey();

  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.go));
  });

  document.getElementById("normalDayBtn").addEventListener("click", () => setWageType("normal"));
  document.getElementById("specialDayBtn").addEventListener("click", () => setWageType("special"));
  document.getElementById("registerWorkBtn").addEventListener("click", registerWork);
  document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
  document.getElementById("salaryMonth").addEventListener("change", renderSalaryPage);

  ["startHour","startMinute","endHour","endMinute","breakMinutes"].forEach(id => {
    document.getElementById(id).addEventListener("change", updateWorkPreview);
  });

  document.getElementById("calendarPrev").addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById("calendarNext").addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    renderCalendar();
  });

  document.getElementById("closeModalBtn").addEventListener("click", closeEditModal);
  document.getElementById("saveEditBtn").addEventListener("click", saveEdit);
  document.getElementById("deleteEditBtn").addEventListener("click", deleteEdit);
  document.getElementById("editModal").addEventListener("click", event => {
    if (event.target.id === "editModal") closeEditModal();
  });

  renderAll();
  showPage("home");
}

document.addEventListener("DOMContentLoaded", init);
