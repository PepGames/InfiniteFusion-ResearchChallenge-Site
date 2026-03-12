const STORAGE_KEY = "fusion-research-tool-current-run";

const defaultRunState = {
  meta: {
    runName: "My Fusion Run",
    createdAt: "",
    updatedAt: "",
    version: 3
  },
  rp: {
    earned: 0,
    spent: 0
  },
  actions: [],
  redoStack: [],
  pokemon: [],
  fusions: [],
  gyms: [],
  achievementProgress: {},
  purchases: []
};

let runState = loadRunState();
let achievementCatalog = [];
let monsterCatalog = [];
let monsterByID = {};

function createNewRunState() {
  const now = new Date().toISOString();

  return {
    ...structuredClone(defaultRunState),
    meta: {
      ...structuredClone(defaultRunState.meta),
      createdAt: now,
      updatedAt: now
    }
  };
}

function loadRunState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const freshState = createNewRunState();
    saveRunState(freshState);
    return freshState;
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeRunState(parsed);
  } catch (error) {
    console.error("Failed to parse saved run data:", error);
    const freshState = createNewRunState();
    saveRunState(freshState);
    return freshState;
  }
}

function saveRunState(state) {
  state.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getAvailableRP() {
  return runState.rp.earned - runState.rp.spent;
}

function renderRun() {
  document.getElementById("run-name").value = runState.meta.runName;
  document.getElementById("rp-earned").textContent = runState.rp.earned;
  document.getElementById("rp-spent").textContent = runState.rp.spent;
  document.getElementById("rp-available").textContent = getAvailableRP();

  renderPokemonList();
  renderAchievements();

  const undoBtn = document.getElementById("undo-action-btn");
  const redoBtn = document.getElementById("redo-action-btn");

  if (undoBtn) undoBtn.disabled = !Array.isArray(runState.actions) || runState.actions.length === 0;
  if (redoBtn) redoBtn.disabled = !Array.isArray(runState.redoStack) || runState.redoStack.length === 0;
}

function renderPokemonList() {
  const list = document.getElementById("action-list");
  list.innerHTML = "";

  if (runState.actions.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "No actions logged yet.";
    list.appendChild(emptyItem);
    return;
  }

  [...runState.actions]
    .slice()
    .reverse()
    .forEach((action) => {
      const li = document.createElement("li");
      li.className = "action-log-item";

      const textSpan = document.createElement("span");
      textSpan.className = "action-log-text";
      textSpan.textContent = formatActionText(action);

      const rightGroup = document.createElement("div");
      rightGroup.className = "action-log-right";

      const timeSpan = document.createElement("span");
      timeSpan.className = "action-log-time";
      timeSpan.textContent = formatActionTimestamp(action.createdAt);

      const deleteButton = document.createElement("button");
      deleteButton.className = "action-delete-btn";
      deleteButton.type = "button";
      deleteButton.textContent = "×";
      deleteButton.setAttribute("aria-label", "Delete action");
      deleteButton.addEventListener("click", () => handleDeleteAction(action.id));

      rightGroup.appendChild(timeSpan);
      rightGroup.appendChild(deleteButton);

      li.appendChild(textSpan);
      li.appendChild(rightGroup);

      list.appendChild(li);
    });
}

function routeLabel(route) {
  return route || "Unknown Area";
}

function updateAndSave() {
  rebuildDerivedStateFromActions();
  const achievementChanges = evaluateAchievements();
  saveRunState(runState);
  renderRun();

  console.log("Achievement changes:", achievementChanges);
}

function handleSaveRunName() {
  const input = document.getElementById("run-name");
  runState.meta.runName = input.value.trim() || "My Fusion Run";
  updateAndSave();
}

function handleNewRun() {
  const confirmed = window.confirm("Create a new run? This will overwrite the current local run.");
  if (!confirmed) return;

  runState = createNewRunState();
  updateAndSave();
}

function handleAddEarnedRP() {
  runState.rp.earned += 1;
  updateAndSave();
}

function handleAddSpentRP() {
  runState.rp.spent += 1;
  updateAndSave();
}

function normalizeRunState(state) {
  return {
    meta: {
      runName: state?.meta?.runName || "My Fusion Run",
      createdAt: state?.meta?.createdAt || new Date().toISOString(),
      updatedAt: state?.meta?.updatedAt || new Date().toISOString(),
      version: state?.meta?.version ?? 3
    },
    rp: {
      earned: state?.rp?.earned || 0,
      spent: state?.rp?.spent || 0
    },
    actions: Array.isArray(state?.actions) ? state.actions : [],
    redoStack: Array.isArray(state?.redoStack) ? state.redoStack : [],
    pokemon: Array.isArray(state?.pokemon) ? state.pokemon : [],
    fusions: Array.isArray(state?.fusions) ? state.fusions : [],
    gyms: Array.isArray(state?.gyms) ? state.gyms : [],
    achievementProgress:
      state?.achievementProgress && !Array.isArray(state.achievementProgress)
        ? state.achievementProgress
        : {},
    purchases: Array.isArray(state?.purchases) ? state.purchases : []
  };
}
function handleLogAction(event) {
  event.preventDefault();

  const actionType = document.getElementById("action-type").value;

  if (actionType === "catch") {
    const speciesSelect = document.getElementById("pokemon-species");
    const routeInput = document.getElementById("pokemon-route");

    const monsterId = speciesSelect?.value || "";
    const route = routeInput?.value.trim() || "";

    if (!monsterId || !route) {
      alert("Catch actions need both a species and a route.");
      return;
    }

    const monster = monsterByID[monsterId];

    if (!monster) {
      alert("Selected monster could not be found in the catalog.");
      return;
    }

    addAction({
      ...createBaseAction("catch"),
      monsterId,
      route
    });

    updateAndSave();
    renderActionFields();
    return;
  }

  if (actionType === "death") {
    const deathTarget = document.getElementById("death-target");
    const deathNote = document.getElementById("death-note");

    const targetPokemonLogId = deathTarget?.value || "";
    const note = deathNote?.value.trim() || "";

    if (!targetPokemonLogId) {
      alert("Please choose a Pokémon to mark as dead.");
      return;
    }

    addAction({
      ...createBaseAction("death"),
      targetPokemonLogId,
      note
    });

    updateAndSave();
    renderActionFields();
    return;
  }

  if (actionType === "fusion") {
    const fusionHead = document.getElementById("fusion-head");
    const fusionBody = document.getElementById("fusion-body");

    const headPokemonLogId = fusionHead?.value || "";
    const bodyPokemonLogId = fusionBody?.value || "";

    if (!headPokemonLogId || !bodyPokemonLogId) {
      alert("Please choose both fusion components.");
      return;
    }

    if (headPokemonLogId === bodyPokemonLogId) {
      alert("A Pokémon cannot fuse with itself.");
      return;
    }

    addAction({
      ...createBaseAction("fusion"),
      headPokemonLogId,
      bodyPokemonLogId
    });

    updateAndSave();
    renderActionFields();
    return;
  }

  if (actionType === "gym") {
    const gymLeaderInput = document.getElementById("gym-leader");
    const gymResultSelect = document.getElementById("gym-result");
    const gymUsedFusionCheckbox = document.getElementById("gym-used-fusion");

    const gymLeader = gymLeaderInput?.value.trim() || "Unknown Gym";
    const result = gymResultSelect?.value || "win";
    const usedFusion = !!gymUsedFusionCheckbox?.checked;

    addAction({
      ...createBaseAction("gym"),
      gymLeader,
      result,
      usedFusion
    });

    updateAndSave();
    renderActionFields();
    return;
  }

  alert("Unknown action type.");
}

function exportRun() {
  const blob = new Blob([JSON.stringify(runState, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = (runState.meta.runName || "fusion-run")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  anchor.href = url;
  anchor.download = `${safeName || "fusion-run"}.json`;
  anchor.click();

  URL.revokeObjectURL(url);
}

function importRun(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (loadEvent) => {
    try {
      const parsed = JSON.parse(loadEvent.target.result);

      if (!parsed.meta || !parsed.rp || !Array.isArray(parsed.pokemon)) {
        throw new Error("Invalid save file format.");
      }

      runState = parsed;
      updateAndSave();
      alert("Run imported successfully.");
    } catch (error) {
      console.error(error);
      alert("Import failed. That JSON file does not match the expected save structure.");
    } finally {
      event.target.value = "";
    }
  };

  reader.readAsText(file);
}

async function loadAchievementCatalog() {
  try {
    const response = await fetch("data/achievements.json");
    achievementCatalog = await response.json();
  } catch (error) {
    console.error("Failed to load achievements:", error);
  }
}

function isPreviousAchievementUnlocked(achievement, progressMap) {
  if (!achievement.previousAchievement) {
    return true;
  }

  return !!progressMap[achievement.previousAchievement]?.unlocked;
}

function countActionsByType(actionType) {
  return runState.actions.filter((action) => action.type === actionType).length;
}

function countGymResults(result) {
  return runState.actions.filter(
    (action) => action.type === "gym" && action.result === result
  ).length;
}

function countGymFusionWins() {
  return runState.actions.filter(
    (action) => action.type === "gym" && action.result === "win" && action.usedFusion
  ).length;
}

function doesAchievementMeetCondition(achievement, progressMap) {
  if (!isPreviousAchievementUnlocked(achievement, progressMap)) {
    return false;
  }

  if (achievement.conditionType === "action_count") {
    const count = countActionsByType(achievement.actionType);
    return count >= (achievement.target || 1);
  }

  if (achievement.conditionType === "gym_result") {
    const count = countGymResults(achievement.result);
    return count >= (achievement.target || 1);
  }

  if (achievement.conditionType === "gym_used_fusion_win") {
    const count = countGymFusionWins();
    return count >= (achievement.target || 1);
  }

  return false;
}

function calculateAchievementEarnedRP(progressMap) {
  return achievementCatalog.reduce((total, achievement) => {
    const progress = progressMap[achievement.id];

    if (progress?.unlocked) {
      return total + (achievement.rpReward || 0);
    }

    return total;
  }, 0);
}

function evaluateAchievements() {
  const previousProgress = structuredClone(runState.achievementProgress);
  const nextProgress = {};

  const now = new Date().toISOString();
  const newlyUnlocked = [];
  const newlyRemoved = [];

  achievementCatalog.forEach((achievement) => {
    const previouslyUnlocked = !!previousProgress[achievement.id]?.unlocked;
    const meetsCondition = doesAchievementMeetCondition(achievement, previousProgress);

    if (meetsCondition) {
      nextProgress[achievement.id] = {
        unlocked: true,
        unlockedAt: previouslyUnlocked
          ? previousProgress[achievement.id]?.unlockedAt || now
          : now
      };

      if (!previouslyUnlocked) {
        newlyUnlocked.push(achievement.id);
      }
    } else {
      if (previouslyUnlocked) {
        newlyRemoved.push(achievement.id);
      }
    }
  });

  runState.achievementProgress = nextProgress;
  runState.rp.earned = calculateAchievementEarnedRP(nextProgress);

  return {
    newlyUnlocked,
    newlyRemoved
  };
}

function renderAchievements() {
  const container = document.getElementById("achievements-list");
  container.innerHTML = "";

  const sortedAchievements = [...achievementCatalog].sort((a, b) => {
    const progressA = runState.achievementProgress[a.id];
    const progressB = runState.achievementProgress[b.id];

    const unlockedA = !!progressA?.unlocked;
    const unlockedB = !!progressB?.unlocked;

    if (unlockedA && unlockedB) {
      const timeA = progressA.unlockedAt || "";
      const timeB = progressB.unlockedAt || "";
      return timeB.localeCompare(timeA);
    }

    if (unlockedA) return -1;
    if (unlockedB) return 1;

    return a.name.localeCompare(b.name);
  });

  sortedAchievements.forEach((achievement) => {
    const progress = runState.achievementProgress[achievement.id];
    const unlocked = !!progress?.unlocked;

    const card = document.createElement("div");
    card.className = "achievement-card";

    if (unlocked) {
      card.classList.add("achievement-complete");
    }

    const statusText = unlocked
      ? `Completed • ${formatActionTimestamp(progress.unlockedAt)}`
      : "Locked";

    card.innerHTML = `
      <div class="achievement-row">
        <div>
          <div class="achievement-title">${achievement.name} (+${achievement.rpReward} RP)</div>
          <div class="achievement-desc">${achievement.description}</div>
          <div class="achievement-desc">${statusText}</div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function claimAchievement(id) {
  console.log("claimAchievement placeholder:", id);
}

async function loadMonsterCatalog() {
  try {
    console.log("Loading monsters from data/monsters.json...");

    const response = await fetch("data/monsters.json");

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    monsterCatalog = await response.json();

    if (!Array.isArray(monsterCatalog)) {
      throw new Error("monsters.json is not an array.");
    }

    monsterByID = {};

    monsterCatalog.forEach((monster) => {
      monsterByID[monster.monsterId] = monster;
    });

    console.log(`Loaded ${monsterCatalog.length} monsters.`);
  } catch (error) {
    console.error("Failed to load monsters:", error);
    alert("Monster database failed to load. Check console.");
  }
}

function populateMonsterSelect() {
  const select = document.getElementById("pokemon-species");
  if (!select) return;

  select.innerHTML = `<option value="">Select a monster</option>`;

  monsterCatalog.forEach((monster) => {
    const option = document.createElement("option");
    option.value = monster.monsterId;

    const variantText = monster.variant ? ` (${monster.variant})` : "";
    option.textContent = `${monster.name}${variantText}`;

    select.appendChild(option);
  });

  console.log(`Populated select with ${monsterCatalog.length} monsters.`);
}

function switchTab(tabName) {
  const buttons = document.querySelectorAll(".tab-button");
  const panels = document.querySelectorAll(".tab-panel");

  buttons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("active", isActive);
  });

  panels.forEach((panel) => {
    const isActive = panel.id === `tab-${tabName}`;
    panel.classList.toggle("active", isActive);
  });
}

function attachTabEventListeners() {
  const buttons = document.querySelectorAll(".tab-button");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });
}

function createBaseAction(type) {
  return {
    id: crypto.randomUUID(),
    type,
    createdAt: new Date().toISOString()
  };
}

function addAction(action) {
  runState.actions.push(action);
  runState.redoStack = [];
}

function rebuildDerivedStateFromActions() {
  const pokemon = [];
  const fusions = [];
  const gyms = [];

  for (const action of runState.actions) {
    switch (action.type) {
      case "catch": {
        const monster = monsterByID[action.monsterId];
        if (!monster) break;

        pokemon.push({
          id: action.id,
          monsterId: action.monsterId,
          speciesName: monster.name,
          variant: monster.variant || "",
          route: action.route || "",
          status: "alive",
          createdAt: action.createdAt
        });
        break;
      }

      case "death": {
        const target = pokemon.find((p) => p.id === action.targetPokemonLogId);
        if (target) {
          target.status = "dead";
          target.deathNote = action.note || "";
        }
        break;
      }

      case "fusion": {
        fusions.push({
          id: action.id,
          headPokemonLogId: action.headPokemonLogId,
          bodyPokemonLogId: action.bodyPokemonLogId,
          createdAt: action.createdAt,
          status: "active"
        });
        break;
      }

      case "gym": {
        gyms.push({
          id: action.id,
          gymLeader: action.gymLeader,
          result: action.result,
          usedFusion: !!action.usedFusion,
          createdAt: action.createdAt
        });
        break;
      }
    }
  }

  runState.pokemon = pokemon;
  runState.fusions = fusions;
  runState.gyms = gyms;
}

function formatActionText(action) {
  if (action.type === "catch") {
    const monster = monsterByID[action.monsterId];
    const monsterName = monster
      ? `${monster.name}${monster.variant ? ` (${monster.variant})` : ""}`
      : action.monsterId;

    return `[CATCH] ${monsterName} — ${action.route}`;
  }

  if (action.type === "death") {
    const target = runState.pokemon.find((p) => p.id === action.targetPokemonLogId);
    const name = target
      ? `${target.speciesName}${target.variant ? ` (${target.variant})` : ""}`
      : "Unknown Pokémon";

    return `[DEATH] ${name}`;
  }

  if (action.type === "fusion") {
    const head = runState.pokemon.find((p) => p.id === action.headPokemonLogId);
    const body = runState.pokemon.find((p) => p.id === action.bodyPokemonLogId);

    const headName = head ? `${head.speciesName}${head.variant ? ` (${head.variant})` : ""}` : "Unknown";
    const bodyName = body ? `${body.speciesName}${body.variant ? ` (${body.variant})` : ""}` : "Unknown";

    return `[FUSION] ${headName} + ${bodyName}`;
  }

  if (action.type === "gym") {
    return `[GYM] ${action.gymLeader} — ${action.result}${action.usedFusion ? " — used fusion" : ""}`;
  }

  return `[UNKNOWN ACTION]`;
}

function renderActionFields() {
  console.log("renderActionFields fired");

  const type = document.getElementById("action-type").value;
  const container = document.getElementById("action-fields");

  console.log("action-fields container:", container);
  console.log("action type:", type);

  if (!container) return;

  container.innerHTML = "";

  if (type === "catch") {
    container.innerHTML = `
      <div class="field-row">
        <label for="pokemon-species">Species</label>
        <select id="pokemon-species" required>
          <option value="">Select a monster</option>
        </select>
      </div>

      <div class="field-row">
        <label for="pokemon-route">Route / Area</label>
        <input id="pokemon-route" type="text" placeholder="e.g. Route 3" required />
      </div>
    `;

    populateMonsterSelect();
  }

  if (type === "death") {
    const alive = runState.pokemon.filter((p) => p.status === "alive");

    const options = alive.map((p) =>
      `<option value="${p.id}">${p.speciesName}${p.variant ? ` (${p.variant})` : ""}</option>`
    ).join("");

    container.innerHTML = `
      <div class="field-row">
        <label for="death-target">Pokémon</label>
        <select id="death-target">
          <option value="">Select a Pokémon</option>
          ${options}
        </select>
      </div>

      <div class="field-row">
        <label for="death-note">Death Note (optional)</label>
        <input id="death-note" type="text" placeholder="e.g. Crit from Brock's Onix" />
      </div>
    `;
  }

  if (type === "fusion") {
    const alive = runState.pokemon.filter((p) => p.status === "alive");
    const options = alive.map((p) =>
      `<option value="${p.id}">${p.speciesName}${p.variant ? ` (${p.variant})` : ""}</option>`
    ).join("");

    container.innerHTML = `
      <div class="field-row">
        <label for="fusion-head">Head Pokémon</label>
        <select id="fusion-head">${options}</select>
      </div>

      <div class="field-row">
        <label for="fusion-body">Body Pokémon</label>
        <select id="fusion-body">${options}</select>
      </div>
    `;
  }

  if (type === "gym") {
    container.innerHTML = `
      <div class="field-row">
        <label for="gym-leader">Gym Leader</label>
        <input id="gym-leader" type="text" placeholder="e.g. Brock" />
      </div>

      <div class="field-row">
        <label for="gym-result">Result</label>
        <select id="gym-result">
          <option value="win">Win</option>
          <option value="loss">Loss</option>
        </select>
      </div>

      <div class="field-row">
        <label>
          <input type="checkbox" id="gym-used-fusion" />
          Used Fusion
        </label>
      </div>
    `;
  }
}

function formatActionTimestamp(isoString) {
  if (!isoString) return "";

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${weekday}, ${month} ${day}${getOrdinalSuffix(day)}, ${year} @ ${hours}:${minutes}${ampm}`;
}

function getOrdinalSuffix(day) {
  if (day >= 11 && day <= 13) return "th";

  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

function handleUndoAction() {
  if (runState.actions.length === 0) return;

  const action = runState.actions.pop();
  runState.redoStack.push(action);

  rebuildDerivedStateFromActions();
  updateAndSave();
}

function handleRedoAction() {
  if (runState.redoStack.length === 0) return;

  const action = runState.redoStack.pop();
  runState.actions.push(action);

  rebuildDerivedStateFromActions();
  updateAndSave();
}

function handleDeleteAction(actionId) {
  const confirmed = window.confirm("Delete this action?");
  if (!confirmed) return;

  runState.actions = runState.actions.filter((action) => action.id !== actionId);
  runState.redoStack = [];

  updateAndSave();
  renderActionFields();
}








function attachEventListeners() {
  document.getElementById("save-run-name-btn").addEventListener("click", handleSaveRunName);
  document.getElementById("new-run-btn").addEventListener("click", handleNewRun);
  document.getElementById("add-earned-rp-btn").addEventListener("click", handleAddEarnedRP);
  document.getElementById("add-spent-rp-btn").addEventListener("click", handleAddSpentRP);
  document.getElementById("action-form").addEventListener("submit", handleLogAction);
  document.getElementById("action-type").addEventListener("change", renderActionFields);
  document.getElementById("export-run-btn").addEventListener("click", exportRun);
  document.getElementById("import-run-input").addEventListener("change", importRun);
  document.getElementById("undo-action-btn").addEventListener("click", handleUndoAction);
  document.getElementById("redo-action-btn").addEventListener("click", handleRedoAction);
}

async function init() {
  await loadAchievementCatalog();
  await loadMonsterCatalog();
  attachEventListeners();
  attachTabEventListeners();
  renderActionFields();
  renderRun();
}

init();