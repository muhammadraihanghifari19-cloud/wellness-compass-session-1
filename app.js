/* ============================================================
   Wellness Compass — app logic
   Flow: Landing -> 5-step form -> Results snapshot
   ============================================================ */
(function () {
  "use strict";

  /* ----------------------------- DOM ----------------------------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const screens = {
    landing: $("#landing"),
    form: $("#formScreen"),
    results: $("#resultsScreen"),
  };

  const form = $("#wellnessForm");
  const steps = $$(".form-step");
  const nextBtn = $("#nextBtn");
  const backBtn = $("#backBtn");
  const submitBtn = $("#submitBtn");
  const stepLabel = $("#stepLabel");
  const progressFill = $("#progressFill");
  const progressBar = $("#progressBar");
  const restartBtn = $("#restartBtn");

  let currentStep = 0;

  /* ----------------------- Navigation helpers -------------------- */
  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      const active = key === name;
      el.hidden = !active;
      el.classList.toggle("active", active);
    });
    restartBtn.hidden = name === "landing";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderStep() {
    steps.forEach((s, i) => s.classList.toggle("active", i === currentStep));
    const total = steps.length;
    stepLabel.textContent = `Step ${currentStep + 1} of ${total}`;
    const pct = Math.round(((currentStep + 1) / total) * 100);
    progressFill.style.width = pct + "%";
    progressBar.setAttribute("aria-valuenow", String(pct));

    backBtn.hidden = currentStep === 0;
    const isLast = currentStep === total - 1;
    nextBtn.hidden = isLast;
    submitBtn.hidden = !isLast;
  }

  /* -------------------------- Validation ------------------------- */
  function clearError(field) {
    field.classList.remove("invalid");
    const err = $(`.field-error[data-for="${field.id}"]`);
    if (err) err.textContent = "";
  }

  function setError(field, msg) {
    field.classList.add("invalid");
    const err = $(`.field-error[data-for="${field.id}"]`);
    if (err) err.textContent = msg;
  }

  function validateStep(stepIndex) {
    const stepEl = steps[stepIndex];
    const required = $$("input[required], select[required]", stepEl);
    let ok = true;
    let firstBad = null;

    required.forEach((field) => {
      clearError(field);
      const val = field.value.trim();
      if (val === "") {
        setError(field, "This field is required.");
        ok = false;
        firstBad = firstBad || field;
        return;
      }
      if (field.type === "number") {
        const num = Number(val);
        const min = Number(field.min);
        const max = Number(field.max);
        if (Number.isNaN(num)) {
          setError(field, "Please enter a number.");
          ok = false; firstBad = firstBad || field;
        } else if (num < min || num > max) {
          setError(field, `Enter a value between ${min} and ${max}.`);
          ok = false; firstBad = firstBad || field;
        }
      }
    });

    if (firstBad) firstBad.focus();
    return ok;
  }

  /* ----------------------- Live range outputs -------------------- */
  function bindRange(id, outId, fmt) {
    const input = $("#" + id);
    const out = $("#" + outId);
    if (!input || !out) return;
    const update = () => { out.textContent = fmt ? fmt(input.value) : input.value; };
    input.addEventListener("input", update);
    update();
  }

  const stressLabels = { 1: "Calm", 2: "Low", 3: "Moderate", 4: "Elevated", 5: "High" };

  bindRange("sleep", "sleepOut");
  bindRange("screen", "screenOut");
  bindRange("water", "waterOut");
  bindRange("stress", "stressOut", (v) => stressLabels[v]);

  // Char counter
  const challenge = $("#challenge");
  const charCount = $("#charCount");
  if (challenge && charCount) {
    challenge.addEventListener("input", () => { charCount.textContent = challenge.value.length; });
  }

  /* ======================= SCORING ENGINE ======================= */
  // Each dimension returns { score: 0-100, note } and feeds overall + strengths/priorities.

  function collectInputs() {
    const g = (id) => $("#" + id).value;
    return {
      height: Number(g("height")),
      weight: Number(g("weight")),
      age: Number(g("age")),
      sleep: Number(g("sleep")),
      activity: Number(g("activity")),       // 0-3
      screen: Number(g("screen")),
      water: Number(g("water")),
      produce: Number(g("produce")),         // 0-3
      stress: Number(g("stress")),           // 1-5
      mood: Number(g("mood")),               // 1-3
      goal: g("goal"),
      challenge: $("#challenge").value.trim(),
    };
  }

  const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

  function bmiScore(height, weight) {
    const m = height / 100;
    const bmi = weight / (m * m);
    let score, note;
    if (bmi < 16) { score = 45; note = "underweight range"; }
    else if (bmi < 18.5) { score = 70; note = "slightly below the healthy range"; }
    else if (bmi < 25) { score = 100; note = "within the healthy range"; }
    else if (bmi < 27.5) { score = 78; note = "slightly above the healthy range"; }
    else if (bmi < 30) { score = 60; note = "in the overweight range"; }
    else if (bmi < 35) { score = 42; note = "in the obese range"; }
    else { score = 28; note = "well above the healthy range"; }
    return { score, bmi: Math.round(bmi * 10) / 10, note };
  }

  function sleepScore(h, age) {
    // Ideal band shifts slightly with age (based on common sleep guidance):
    //   adults ~7-9h; older adults (65+) ~7-8h is plenty, so cap the "too much" penalty gentler.
    const lo = 7;
    const hi = age >= 65 ? 8 : 9;
    if (h >= lo && h <= hi) return 100;
    if (h >= 6 && h < lo) return 82;
    if (h > hi && h <= hi + 1) return age >= 65 ? 88 : 80; // extra sleep is less of a flag for older adults
    if (h >= 5 && h < 6) return 58;
    if (h > hi + 1) return 62;
    return 38; // < 5
  }

  function activityScore(a) { return [30, 62, 88, 100][a] ?? 30; }
  function produceScore(p) { return [32, 60, 85, 100][p] ?? 32; }

  function screenScore(s) {
    if (s <= 2) return 100;
    if (s <= 4) return 85;
    if (s <= 6) return 68;
    if (s <= 8) return 50;
    if (s <= 10) return 36;
    return 24;
  }

  function waterScore(w) {
    if (w >= 8) return 100;
    if (w >= 6) return 86;
    if (w >= 4) return 66;
    if (w >= 2) return 44;
    return 26;
  }

  function stressScore(st, mood) {
    // lower stress + higher mood is better
    const stressPart = { 1: 100, 2: 86, 3: 66, 4: 44, 5: 28 }[st] ?? 60;
    const moodPart = { 3: 100, 2: 68, 1: 40 }[mood] ?? 60;
    return Math.round(stressPart * 0.6 + moodPart * 0.4);
  }

  // Dimension definitions with weights
  function buildDimensions(input) {
    const bmi = bmiScore(input.height, input.weight);
    return [
      { key: "sleep", label: "Sleep", score: clamp(sleepScore(input.sleep, input.age)), weight: 1.1, icon: "😴" },
      { key: "activity", label: "Activity", score: clamp(activityScore(input.activity)), weight: 1.1, icon: "🏃" },
      { key: "nutrition", label: "Nutrition", score: clamp(produceScore(input.produce)), weight: 1.0, icon: "🥗" },
      { key: "hydration", label: "Hydration", score: clamp(waterScore(input.water)), weight: 0.8, icon: "💧" },
      { key: "screen", label: "Screen balance", score: clamp(screenScore(input.screen)), weight: 0.8, icon: "📱" },
      { key: "stress", label: "Stress & mood", score: clamp(stressScore(input.stress, input.mood)), weight: 1.1, icon: "🧘" },
      { key: "body", label: "Body (BMI)", score: clamp(bmi.score), weight: 0.9, icon: "⚖️", meta: bmi },
    ];
  }

  // Which dimensions each goal cares about most.
  const GOAL_FOCUS = {
    energy: ["sleep", "activity", "hydration"],
    sleep: ["sleep", "screen", "stress"],
    fitness: ["activity", "body", "nutrition"],
    stress: ["stress", "sleep", "screen"],
    weight: ["body", "nutrition", "activity"],
    nutrition: ["nutrition", "hydration", "body"],
    balance: ["sleep", "activity", "stress"],
  };

  // Simple keyword -> dimension map for the free-text challenge.
  const CHALLENGE_KEYWORDS = {
    sleep: ["sleep", "insomnia", "tired", "exhausted", "wind down", "wind-down", "night", "rest", "awake", "bedtime"],
    activity: ["exercise", "workout", "sit", "sitting", "desk", "sedentary", "lazy", "move", "gym", "walk", "fit"],
    nutrition: ["eat", "diet", "junk", "snack", "sugar", "fast food", "vegetable", "veg", "fruit", "cook", "meal"],
    hydration: ["water", "hydrate", "hydration", "thirsty", "drink"],
    screen: ["screen", "phone", "scroll", "social media", "tv", "gaming", "game", "laptop"],
    stress: ["stress", "anxious", "anxiety", "overwhelm", "burnout", "burn out", "worry", "tense", "pressure", "mood"],
    body: ["weight", "overweight", "lose weight", "bmi", "fat", "gain"],
  };

  // Detect which dimensions the user's challenge text mentions.
  function detectChallengeFocus(text) {
    if (!text) return [];
    const t = text.toLowerCase();
    const hits = [];
    Object.entries(CHALLENGE_KEYWORDS).forEach(([dim, words]) => {
      if (words.some((w) => t.includes(w))) hits.push(dim);
    });
    return hits;
  }

  // Build the ordered priority list, letting goal + challenge raise relevant areas.
  // Scores themselves stay honest; this only influences ordering/selection and plan focus.
  function selectPriorities(dims, input) {
    const goalFocus = GOAL_FOCUS[input.goal] || [];
    const challengeFocus = detectChallengeFocus(input.challenge);
    const boosted = new Set([...goalFocus, ...challengeFocus]);

    // Rank by "need": lower score = more need; being in focus adds urgency.
    const ranked = [...dims]
      .map((d) => {
        // need rises as score falls; focus adds a nudge but can't outrank a genuinely poor score.
        const need = (100 - d.score) + (boosted.has(d.key) ? 14 : 0);
        return { dim: d, need, inFocus: boosted.has(d.key) };
      })
      .sort((a, b) => b.need - a.need);

    // A dimension is a real priority if it scores below 60, OR it's a focus area that
    // still has clear room to improve (below 80). This keeps goal/challenge meaningful
    // even when nothing is critically low.
    const priorities = ranked
      .filter((r) => r.dim.score < 60 || (r.inFocus && r.dim.score < 80))
      .map((r) => r.dim)
      .slice(0, 3);

    if (priorities.length === 0) priorities.push(ranked[0].dim);
    return { priorities, goalFocus, challengeFocus };
  }

  function overallScore(dims) {
    const totalW = dims.reduce((a, d) => a + d.weight, 0);
    const sum = dims.reduce((a, d) => a + d.score * d.weight, 0);
    return Math.round(sum / totalW);
  }

  function tierFor(score) {
    if (score >= 85) return { label: "Thriving", color: "#35a884" };
    if (score >= 70) return { label: "Doing well", color: "#4f9fd6" };
    if (score >= 55) return { label: "Finding your footing", color: "#e8a33d" };
    if (score >= 40) return { label: "Room to grow", color: "#e8835a" };
    return { label: "Time for a reset", color: "#e8705a" };
  }

  function barColor(score) {
    if (score >= 75) return "var(--good)";
    if (score >= 50) return "var(--mid)";
    return "var(--low)";
  }

  /* --------------------- Recommendation content ------------------ */
  const TIPS = {
    sleep: {
      strength: "You're giving your body solid, restorative sleep.",
      priority: "Your sleep is running short, which ripples into energy, focus, and mood.",
      actions: ["Set a wind-down alarm 45 minutes before bed", "Keep screens out of the bedroom tonight"],
      plan: ["Pick a consistent lights-out time and set a reminder.", "Dim lights and avoid screens 30 min before bed.", "Try a 10-minute reading or breathing wind-down."],
    },
    activity: {
      strength: "You move your body regularly — great for energy and mood.",
      priority: "Movement is light right now; adding a little goes a long way.",
      actions: ["Take a brisk 15-minute walk today", "Do 5 minutes of stretching between tasks"],
      plan: ["Schedule two short walks this week.", "Add a 15-minute bodyweight session.", "Try one activity you genuinely enjoy."],
    },
    nutrition: {
      strength: "You're eating a good amount of fruit and vegetables.",
      priority: "Fruit and veg intake is on the low side — an easy win to build on.",
      actions: ["Add one piece of fruit to your next meal", "Fill half your lunch plate with vegetables"],
      plan: ["Add one serving of veg to lunch and dinner.", "Prep a bowl of cut fruit for easy snacking.", "Swap one processed snack for a whole food."],
    },
    hydration: {
      strength: "You're well hydrated through the day.",
      priority: "Hydration could be higher; mild dehydration quietly saps focus.",
      actions: ["Fill a water bottle and keep it on your desk", "Drink a glass of water before each meal"],
      plan: ["Start each morning with a full glass of water.", "Set two hydration reminders during the day.", "Carry a refillable bottle wherever you go."],
    },
    screen: {
      strength: "You keep recreational screen time in healthy check.",
      priority: "Recreational screen time is high and may be crowding out rest and movement.",
      actions: ["Set a 30-minute screen limit on one app today", "Take a screen-free break every hour"],
      plan: ["Set an app timer on your most-used app.", "Create one screen-free hour before bed.", "Replace one scroll session with a walk."],
    },
    stress: {
      strength: "You're managing stress well and your energy feels steady.",
      priority: "Stress is weighing on you — small resets can make a real difference.",
      actions: ["Take 5 slow breaths right now (4-count in, 6-count out)", "Step outside for a short mindful break"],
      plan: ["Try a 5-minute breathing exercise each morning.", "Block one short restorative break daily.", "Write down three things that went well today."],
    },
    body: {
      strength: "Your BMI sits in a healthy range — a strong foundation.",
      priority: "Your BMI is outside the healthy range; steady habits matter more than quick fixes.",
      actions: ["Focus on one balanced, home-cooked meal today", "Add a short walk after your largest meal"],
      plan: ["Aim for balanced plates: protein, veg, whole grains.", "Build gentle, consistent daily movement.", "Keep steady sleep — it supports a healthy weight."],
    },
  };

  const GOAL_COPY = {
    energy: "Your focus: boosting daily energy. The plan below leans into sleep, movement, and hydration.",
    sleep: "Your focus: sleeping better. We've prioritized wind-down routines and screen balance.",
    fitness: "Your focus: moving more. Expect a gentle, build-able activity progression.",
    stress: "Your focus: lowering stress. Breathing, breaks, and recovery lead the way.",
    weight: "Your focus: a healthier weight. We lean on steady habits over quick fixes.",
    nutrition: "Your focus: eating better. Small, repeatable food swaps are front and center.",
    balance: "Your focus: better balance. The plan spreads attention across your whole week.",
  };

  /* --------------------------- Rendering ------------------------- */
  function renderResults(input) {
    const dims = buildDimensions(input);
    const score = overallScore(dims);
    const tier = tierFor(score);
    const bodyDim = dims.find((d) => d.key === "body");

    // Gauge
    const CIRC = 2 * Math.PI * 52; // 326.7
    const arc = $("#gaugeArc");
    arc.style.stroke = tier.color;
    requestAnimationFrame(() => {
      arc.style.strokeDashoffset = String(CIRC * (1 - score / 100));
    });
    animateNumber($("#scoreValue"), score);

    $("#snapshotTier").textContent = tier.label;
    $("#snapshotTier").style.color = tier.color;
    $("#snapshotSummary").textContent = summaryText(score, dims, bodyDim);
    $("#snapshotGoal").textContent = GOAL_COPY[input.goal] || "";

    // Dimensions (sorted high -> low for readability)
    const dimList = $("#dimensionList");
    dimList.innerHTML = "";
    [...dims].sort((a, b) => b.score - a.score).forEach((d) => {
      const li = document.createElement("li");
      li.className = "dimension-item";
      li.innerHTML = `
        <span class="dimension-name">${d.icon} ${d.label}</span>
        <span class="dimension-bar"><span></span></span>
        <span class="dimension-score">${d.score}</span>`;
      dimList.appendChild(li);
      const bar = li.querySelector(".dimension-bar span");
      bar.style.background = barColor(d.score);
      requestAnimationFrame(() => { bar.style.width = d.score + "%"; });
    });

    // Strengths & priorities (goal + challenge influence the priority selection)
    const sorted = [...dims].sort((a, b) => b.score - a.score);
    const strengths = sorted.filter((d) => d.score >= 75).slice(0, 3);
    const { priorities, goalFocus, challengeFocus } = selectPriorities(dims, input);

    // Fallback so strengths is never empty
    if (strengths.length === 0) strengths.push(sorted[0]);

    fillPillList($("#strengthsList"), strengths, "strength");
    fillPillList($("#prioritiesList"), priorities, "priority");

    // Echo the user's own challenge back so they can see it was heard
    renderChallengeEcho(input, dims, challengeFocus);

    // 7-day plan — weave priority + goal-focus dimensions across the week
    render7DayPlan(priorities, goalFocus, input);

    // Daily routine
    renderRoutine(input);
  }

  // Show the user's challenge text and connect it to what the plan addresses.
  function renderChallengeEcho(input, dims, challengeFocus) {
    const box = $("#challengeEcho");
    if (!box) return;
    const text = input.challenge;
    if (!text) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    const labels = challengeFocus
      .map((k) => (dims.find((d) => d.key === k) || {}).label)
      .filter(Boolean);
    const addressed = labels.length
      ? `We picked up on <strong>${labels.join(", ").toLowerCase()}</strong> and worked ${labels.length > 1 ? "them" : "it"} into your plan below.`
      : "We've kept this in mind while shaping your plan below.";
    box.innerHTML = `
      <p class="challenge-quote">“${escapeHtml(text)}”</p>
      <p class="challenge-note">${addressed}</p>`;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function summaryText(score, dims, bodyDim) {
    const best = [...dims].sort((a, b) => b.score - a.score)[0];
    const worst = [...dims].sort((a, b) => a.score - b.score)[0];
    const bmiNote = bodyDim.meta ? ` Your BMI of ${bodyDim.meta.bmi} is ${bodyDim.meta.note}.` : "";
    let lead;
    if (score >= 85) lead = "You've built genuinely strong habits across the board.";
    else if (score >= 70) lead = "You're in good shape, with a few areas to sharpen.";
    else if (score >= 55) lead = "You've got a solid base and clear room to grow.";
    else if (score >= 40) lead = "There's real opportunity here — a few focused changes will add up fast.";
    else lead = "This is a great moment for a reset, one small habit at a time.";
    return `${lead} ${best.label} is your bright spot, while ${worst.label.toLowerCase()} needs the most attention.${bmiNote}`;
  }

  function fillPillList(ul, dims, type) {
    ul.innerHTML = "";
    dims.forEach((d) => {
      const li = document.createElement("li");
      const tip = TIPS[d.key];
      li.textContent = `${d.label}: ${type === "strength" ? tip.strength : tip.priority}`;
      ul.appendChild(li);
    });
  }

  function render7DayPlan(priorities, goalFocus, input) {
    const list = $("#planList");
    list.innerHTML = "";

    // Order dimensions by relevance: priorities first, then goal focus, then everything else.
    const focusKeys = priorities.map((d) => d.key);
    const allKeys = ["sleep", "activity", "nutrition", "hydration", "stress", "screen", "body"];
    const ordered = [...new Set([...focusKeys, ...goalFocus, ...allKeys])];

    // Build a varied pool, preferring relevant dimensions but drawing from each so we
    // can fill all 7 days with distinct items even if only one area needs work.
    const pool = [];
    ordered.forEach((k) => (TIPS[k].plan || []).forEach((text) => pool.push({ k, text })));

    const dayThemes = [
      "Set the foundation",
      "Build momentum",
      "Add a healthy swap",
      "Mid-week check-in",
      "Stack a new habit",
      "Recover & reflect",
      "Lock it in",
    ];

    // Pick 7 distinct items; only repeat if the pool is genuinely smaller than 7.
    const chosen = [];
    const used = new Set();
    for (const item of pool) {
      if (chosen.length === 7) break;
      if (!used.has(item.text)) { chosen.push(item); used.add(item.text); }
    }
    // Pad (rare: fewer than 7 unique tips) by cycling what we have.
    let idx = 0;
    while (chosen.length < 7) { chosen.push(pool[idx % pool.length]); idx++; }

    chosen.forEach((item, i) => {
      const li = document.createElement("li");
      li.className = "plan-day";
      li.innerHTML = `<h4>Day ${i + 1} · ${dayThemes[i]}</h4><p>${item.text}</p>`;
      list.appendChild(li);
    });
  }

  function renderRoutine(input) {
    const grid = $("#routineList");
    const earlyWalk = input.activity >= 1;
    const blocks = [
      {
        time: "Morning", ico: "🌅", items: [
          "A full glass of water on waking",
          input.sleep < 7 ? "Get daylight within 30 min to reset your clock" : "Light stretch to wake the body",
          "A balanced breakfast with some protein",
        ],
      },
      {
        time: "Midday", ico: "☀️", items: [
          "Half your plate as vegetables at lunch",
          earlyWalk ? "A brisk 15-min walk" : "A short 10-min movement break",
          "Top up your water bottle",
        ],
      },
      {
        time: "Afternoon", ico: "🌤️", items: [
          input.stress >= 4 ? "A 5-min breathing reset" : "A quick posture & stretch break",
          "Swap one scroll break for a stand-up or walk",
          "A whole-food snack if hungry",
        ],
      },
      {
        time: "Evening", ico: "🌙", items: [
          "Dim lights and ease off screens an hour before bed",
          "A light, early-ish dinner",
          "Jot one thing that went well today",
        ],
      },
    ];

    grid.innerHTML = "";
    blocks.forEach((b) => {
      const card = document.createElement("div");
      card.className = "routine-card";
      card.innerHTML = `
        <div class="routine-time"><span class="ico">${b.ico}</span>${b.time}</div>
        <ul>${b.items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
      grid.appendChild(card);
    });
  }

  /* --------------------- Storage helpers -------------------------------- */
  function safeStorage() {
    try {
      const t = "__wc_test__";
      window.localStorage.setItem(t, "1");
      window.localStorage.removeItem(t);
      return window.localStorage;
    } catch (_) {
      return null;
    }
  }

  /* ----------------- Reading persistence (survives reload) -------------- */
  const READING_KEY = "wc_last_reading_v1";

  function persistReading(input) {
    const store = safeStorage();
    if (!store) return;
    try { store.setItem(READING_KEY, JSON.stringify(input)); } catch (_) { /* ignore */ }
  }

  function loadReading() {
    const store = safeStorage();
    if (!store) return null;
    try {
      const raw = store.getItem(READING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function clearReading() {
    const store = safeStorage();
    if (!store) return;
    try { store.removeItem(READING_KEY); } catch (_) { /* ignore */ }
  }

  function animateNumber(el, target) {
    const dur = 1000;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* --------------------------- Events ---------------------------- */
  $("#startBtn").addEventListener("click", () => {
    showScreen("form");
    currentStep = 0;
    renderStep();
  });

  nextBtn.addEventListener("click", () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < steps.length - 1) {
      currentStep++;
      renderStep();
    }
  });

  backBtn.addEventListener("click", () => {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // validate all steps
    for (let i = 0; i < steps.length; i++) {
      if (!validateStep(i)) {
        currentStep = i;
        renderStep();
        return;
      }
    }
    const input = collectInputs();
    persistReading(input);
    renderResults(input);
    showScreen("results");
  });

  function resetAll() {
    // A fresh check-in means the previous reading no longer applies.
    clearReading();
    form.reset();
    currentStep = 0;
    // re-init range outputs after reset
    ["sleep", "screen", "water", "stress"].forEach((id) => {
      const inp = $("#" + id);
      inp.dispatchEvent(new Event("input"));
    });
    if (charCount) charCount.textContent = "0";
    renderStep();
  }

  restartBtn.addEventListener("click", () => {
    resetAll();
    showScreen("landing");
  });

  $("#againBtn").addEventListener("click", () => {
    resetAll();
    showScreen("form");
  });

  $("#brandHome").addEventListener("click", (e) => {
    e.preventDefault();
    showScreen("landing");
  });

  $("#printBtn").addEventListener("click", () => window.print());

  // Enter key advances steps instead of submitting prematurely
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      if (!submitBtn.hidden) return; // let submit happen on last step
      e.preventDefault();
      nextBtn.click();
    }
  });

  // Header shadow on scroll
  const header = $(".site-header");
  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 8);
  });

  // Init — if a previous reading exists (e.g. after a page reload), restore it so
  // checked-off actions and the snapshot persist as promised.
  function init() {
    renderStep();
    const prev = loadReading();
    if (prev && typeof prev === "object" && prev.height) {
      renderResults(prev);
      showScreen("results");
    }
  }

  init();
})();
