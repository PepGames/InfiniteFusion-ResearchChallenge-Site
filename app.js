const STORAGE_KEY = "fusion-research-tool-current-run";

const defaultRunState = {
  meta: {
    runName: "My Fusion Run",
    createdAt: "",
    updatedAt: "",
    version: 1
  },
  rp: {
    earned: 0,
    spent: 0
  },
  pokemon: [],
  fusions: [],
  achievements: [],
  purchases: []
};

let runState = loadRunState();
let achievementCatalog = [];
let monsterCatalog = [];
let monsterByID = {};
let monsterByName = {};

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
    return parsed;
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
  const list = document.getElementById("pokemon-list");
  list.innerHTML = "";

  if (runState.pokemon.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "No Pokémon logged yet.";
    list.appendChild(emptyItem);
    return;
  }

  runState.pokemon.forEach((pokemon) => {
    const monster = monsterByID[pokemon.monsterId];
    const variantText = pokemon.variant ? ` (${pokemon.variant})` : "";
    const typeText = monster
      ? [monster.primaryType, monster.secondaryType].filter(Boolean).join(" / ")
      : "Unknown Type";

    const li = document.createElement("li");
    li.textContent = `${pokemon.speciesName}${variantText} — ${routeLabel(pokemon.route)} — ${typeText} — ${pokemon.status}`;
    list.appendChild(li);
  });
}

function routeLabel(route) {
  return route || "Unknown Area";
}

function updateAndSave() {
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

function handleLogAction(event) {
  event.preventDefault();

  const speciesInput = document.getElementById("pokemon-species");
  const routeInput = document.getElementById("pokemon-route");

  const speciesText = speciesInput.value.trim();
  const route = routeInput.value.trim();

  if (!speciesText || !route) return;

  const monster = monsterByName[speciesText.toLowerCase()];

  if (!monster) {
    alert("Please choose a valid monster from the list.");
    return;
  }

  runState.pokemon.push({
    id: crypto.randomUUID(),
    monsterId: monster.monsterId,
    speciesName: monster.name,
    variant: monster.variant || "",
    route,
    status: "alive",
    createdAt: new Date().toISOString()
  });

  speciesInput.value = "";
  routeInput.value = "";

  evaluateAchievements();
  updateAndSave();
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

async function loadMonsterCatalog() {
  try {
    console.log("Loading monsters from data/monsters.json...");

    const response = await fetch("data/monsters.json");

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} while loading monsters.json`);
    }

    monsterCatalog = await response.json();

    monsterByID = {};
    monsterByName = {};

    monsterCatalog.forEach((monster) => {
      monsterByID[monster.monsterId] = monster;

      const displayName = `${monster.name}${monster.variant ? ` (${monster.variant})` : ""}`;
      monsterByName[displayName.toLowerCase()] = monster;
    });

    console.log(`Loaded ${monsterCatalog.length} monsters.`);
  } catch (error) {
    console.error("Failed to load monsters:", error);
  }
}

function populateMonsterSelect() {
  const datalist = document.getElementById("monster-options");
  if (!datalist) return;

  datalist.innerHTML = "";

  monsterCatalog.forEach((monster) => {
    const option = document.createElement("option");
    const variantText = monster.variant ? ` (${monster.variant})` : "";
    option.value = `${monster.name}${variantText}`;
    datalist.appendChild(option);
  });
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

function attachEventListeners() {
  document.getElementById("save-run-name-btn").addEventListener("click", handleSaveRunName);
  document.getElementById("new-run-btn").addEventListener("click", handleNewRun);
  document.getElementById("add-earned-rp-btn").addEventListener("click", handleAddEarnedRP);
  document.getElementById("add-spent-rp-btn").addEventListener("click", handleAddSpentRP);
  document.getElementById("add-pokemon-form").addEventListener("submit", handleLogAction);
  document.getElementById("export-run-btn").addEventListener("click", exportRun);
  document.getElementById("import-run-input").addEventListener("change", importRun);
  document.getElementById("add-pokemon-form").addEventListener("submit", handleLogAction);
}

async function init() {
  await loadAchievementCatalog();
  await loadMonsterCatalog();
  populateMonsterSelect();
  attachEventListeners();
  attachTabEventListeners();
  renderRun();
}

init();