const STORAGE_KEY = "fusion-research-tool-current-run";

const defaultRunState = {
  meta: {
    runName: "My Fusion Run",
    createdAt: "",
    updatedAt: "",
    version: 2
  },
  rp: {
    earned: 0,
    spent: 0
  },
  actions: [],
  pokemon: [],
  fusions: [],
  gyms: [],
  achievements: [],
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
      li.textContent = formatActionText(action);
      list.appendChild(li);
    });
}

function routeLabel(route) {
  return route || "Unknown Area";
}

function updateAndSave() {
  rebuildDerivedStateFromActions();
  evaluateAchievements();
  saveRunState(runState);
  renderRun();
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
      version: 2
    },
    rp: {
      earned: state?.rp?.earned || 0,
      spent: state?.rp?.spent || 0
    },
    actions: Array.isArray(state?.actions) ? state.actions : [],
    pokemon: Array.isArray(state?.pokemon) ? state.pokemon : [],
    fusions: Array.isArray(state?.fusions) ? state.fusions : [],
    gyms: Array.isArray(state?.gyms) ? state.gyms : [],
    achievements: Array.isArray(state?.achievements) ? state.achievements : [],
    purchases: Array.isArray(state?.purchases) ? state.purchases : []
  };
}

function handleLogAction(event) {
  event.preventDefault();

  const actionType = document.getElementById("action-type").value;
  const speciesSelect = document.getElementById("pokemon-species");
  const routeInput = document.getElementById("pokemon-route");

  const monsterId = speciesSelect.value;
  const route = routeInput.value.trim();

  if (actionType === "catch") {
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

    speciesSelect.value = "";
    routeInput.value = "";
    updateAndSave();
    return;
  }

  if (actionType === "death") {
    const alivePokemon = runState.pokemon.filter((p) => p.status === "alive");
    if (alivePokemon.length === 0) {
      alert("There are no alive Pokémon to mark as dead.");
      return;
    }

    const target = alivePokemon[alivePokemon.length - 1];

    addAction({
      ...createBaseAction("death"),
      targetPokemonLogId: target.id,
      note: ""
    });

    updateAndSave();
    return;
  }

  if (actionType === "fusion") {
    const alivePokemon = runState.pokemon.filter((p) => p.status === "alive");

    if (alivePokemon.length < 2) {
      alert("You need at least two alive Pokémon to log a fusion.");
      return;
    }

    const head = alivePokemon[alivePokemon.length - 2];
    const body = alivePokemon[alivePokemon.length - 1];

    addAction({
      ...createBaseAction("fusion"),
      headPokemonLogId: head.id,
      bodyPokemonLogId: body.id
    });

    updateAndSave();
    return;
  }

  if (actionType === "gym") {
    addAction({
      ...createBaseAction("gym"),
      gymLeader: "Unknown Gym",
      result: "win",
      usedFusion: runState.fusions.length > 0
    });

    updateAndSave();
    return;
  }
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

function evaluateAchievements() {
  // placeholder for automatic achievement logic
}

function renderAchievements() {
  const container = document.getElementById("achievements-list");
  container.innerHTML = "";

  achievementCatalog.forEach((achievement) => {
    const completed = runState.achievements.includes(achievement.id);

    const card = document.createElement("div");
    card.className = "achievement-card";

    if (completed) card.classList.add("achievement-complete");

    card.innerHTML = `
      <div class="achievement-row">
        <div>
          <div class="achievement-title">${achievement.name} (+${achievement.rpReward} RP)</div>
          <div class="achievement-desc">${achievement.description}</div>
        </div>
        <button ${completed ? "disabled" : ""} data-id="${achievement.id}">
          ${completed ? "Completed" : "Claim"}
        </button>
      </div>
    `;

    const button = card.querySelector("button");

    if (!completed) {
      button.addEventListener("click", () => claimAchievement(achievement.id));
    }

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
  const type = document.getElementById("action-type").value;
  const container = document.getElementById("action-fields");

  container.innerHTML = "";

  if (type === "catch") {
    container.innerHTML = `
      <div class="field-row">
        <label>Species</label>
        <select id="pokemon-species">
          <option value="">Select a monster</option>
        </select>
      </div>

      <div class="field-row">
        <label>Route / Area</label>
        <input id="pokemon-route" type="text" placeholder="e.g. Route 3">
      </div>
    `;

    populateMonsterSelect();
  }

  if (type === "death") {
    const alive = runState.pokemon.filter(p => p.status === "alive");

    const options = alive.map(p =>
      `<option value="${p.id}">${p.speciesName}</option>`
    ).join("");

    container.innerHTML = `
      <div class="field-row">
        <label>Pokémon</label>
        <select id="death-target">
          ${options}
        </select>
      </div>
    `;
  }

  if (type === "fusion") {
    const alive = runState.pokemon.filter(p => p.status === "alive");

    const options = alive.map(p =>
      `<option value="${p.id}">${p.speciesName}</option>`
    ).join("");

    container.innerHTML = `
      <div class="field-row">
        <label>Head Pokémon</label>
        <select id="fusion-head">${options}</select>
      </div>

      <div class="field-row">
        <label>Body Pokémon</label>
        <select id="fusion-body">${options}</select>
      </div>
    `;
  }

  if (type === "gym") {
    container.innerHTML = `
      <div class="field-row">
        <label>Gym Leader</label>
        <input id="gym-leader" placeholder="Brock">
      </div>

      <div class="field-row">
        <label>Result</label>
        <select id="gym-result">
          <option value="win">Win</option>
          <option value="loss">Loss</option>
        </select>
      </div>

      <div class="field-row">
        <label>
          <input type="checkbox" id="gym-used-fusion">
          Used Fusion
        </label>
      </div>
    `;
  }
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