// =========================
// Constants / Global State
// =========================

const STORAGE_KEY = "fusion-research-tool-current-run";
const DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "true";

const defaultRunState = {
  meta: {
    runName: "My Fusion Run",
    createdAt: "",
    updatedAt: "",
    version: 4
  },
  rp: {
    achievementEarned: 0,
    bonusEarned: 0,
    spent: 0
  },
  resources: {
    catchesAvailable: 0,
    splitsAvailable: 0
  },
  actions: [],
  redoStack: [],
  pokemon: [],
  fusions: [],
  battles: [],
  achievementProgress: {},
  purchases: []
};

const actionHandlers = {
  catch: handleCatchAction,
  death: handleDeathAction,
  fusion: handleFusionAction,
  battle: handleBattleAction
};


let runState = loadRunState();
let achievementCatalog = [];
let speciesCatalog = [];
let speciesById = {};
let hasRenderedFusionFlowerOnce = false;
let locationCatalog = [];
let locationById = {};
let trainerCatalog = [];
let trainerById = {};

let lastRenderedFusionFlowerValues = {
  fusions: null,
  catches: null,
  splits: null
};

document.fonts.load("1em 'Permanent Marker'").then(() => {
  document.body.classList.add("marker-font");
});

// =========================
// Persistence / Save State
// =========================

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

function normalizeRunState(state) {
  return {
    meta: {
      runName: state?.meta?.runName || "My Fusion Run",
      createdAt: state?.meta?.createdAt || new Date().toISOString(),
      updatedAt: state?.meta?.updatedAt || new Date().toISOString(),
      version: state?.meta?.version ?? 4
    },
    rp: {
      achievementEarned: state?.rp?.achievementEarned || 0,
      bonusEarned: state?.rp?.bonusEarned || 0,
      spent: state?.rp?.spent || 0
    },
    resources: {
      catchesAvailable: state?.resources?.catchesAvailable ?? 0,
      splitsAvailable: state?.resources?.splitsAvailable ?? 0
    },
    actions: Array.isArray(state?.actions) ? state.actions : [],
    redoStack: Array.isArray(state?.redoStack) ? state.redoStack : [],
    pokemon: Array.isArray(state?.pokemon) ? state.pokemon : [],
    fusions: Array.isArray(state?.fusions) ? state.fusions : [],
    battles: Array.isArray(state?.battles) ? state.battles : [],
    achievementProgress:
      state?.achievementProgress && !Array.isArray(state.achievementProgress)
        ? state.achievementProgress
        : {},
    purchases: Array.isArray(state?.purchases) ? state.purchases : []
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


// =========================
// Catalog Loading
// =========================

async function loadAchievementCatalog() {
  try {
    const response = await fetch("data/achievements.json");
    achievementCatalog = await response.json();
    validateAchievementCatalog();
  } catch (error) {
    console.error("Failed to load achievements:", error);
  }
}

async function loadSpeciesCatalog() {
  try {
    debugLog("Loading species from data/species.json...");

    const response = await fetch("data/species.json");

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    speciesCatalog = await response.json();

    if (!Array.isArray(speciesCatalog)) {
      throw new Error("species.json is not an array.");
    }

    speciesById = {};

    speciesCatalog.forEach((species) => {
      speciesById[species.speciesId] = species;
    });

    debugLog(`Loaded ${speciesCatalog.length} species.`);
  } catch (error) {
    console.error("Failed to load species:", error);
    alert("Species database failed to load. Check console.");
  }
}

async function loadLocationCatalog() {
  try {
    debugLog("Loading locations from data/locations.json...");

    const response = await fetch("data/locations.json");

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    locationCatalog = await response.json();

    if (!Array.isArray(locationCatalog)) {
      throw new Error("locations.json is not an array.");
    }

    locationById = {};

    locationCatalog.forEach((location) => {
      locationById[location.locationId] = location;
    });

    debugLog(`Loaded ${locationCatalog.length} locations.`);
  } catch (error) {
    console.error("Failed to load locations:", error);
    alert("Location database failed to load. Check console.");
  }
}

async function loadTrainerCatalog() {
  try {
    debugLog("Loading trainers from data/trainers.json...");

    const response = await fetch("data/trainers.json");

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    trainerCatalog = await response.json();

    if (!Array.isArray(trainerCatalog)) {
      throw new Error("trainers.json is not an array.");
    }

    trainerById = {};

    trainerCatalog.forEach((trainer) => {
      trainerById[trainer.trainerId] = trainer;
    });

    debugLog(`Loaded ${trainerCatalog.length} trainers.`);
  } catch (error) {
    console.error("Failed to load trainers:", error);
    alert("Trainer database failed to load. Check console.");
  }
}

function validateAchievementCatalog() {
  const errors = [];
  const achievementIds = new Set();
  const achievementMap = {};

  for (const achievement of achievementCatalog) {
    if (!achievement?.id) {
      errors.push("Achievement missing id.");
      continue;
    }

    if (achievementIds.has(achievement.id)) {
      errors.push(`Duplicate achievement id: ${achievement.id}`);
    }

    achievementIds.add(achievement.id);
    achievementMap[achievement.id] = achievement;
  }

  for (const achievement of achievementCatalog) {
    const prev = achievement.previousAchievement;

    if (prev && !achievementMap[prev]) {
      errors.push(
        `Achievement "${achievement.id}" references missing previousAchievement "${prev}".`
      );
    }
  }

  function hasCycle(startId, visited = new Set(), stack = new Set()) {
    if (stack.has(startId)) return true;
    if (visited.has(startId)) return false;

    visited.add(startId);
    stack.add(startId);

    const achievement = achievementMap[startId];
    const prev = achievement?.previousAchievement;

    if (prev && achievementMap[prev]) {
      if (hasCycle(prev, visited, stack)) {
        return true;
      }
    }

    stack.delete(startId);
    return false;
  }

  for (const achievement of achievementCatalog) {
    if (hasCycle(achievement.id)) {
      errors.push(`Circular dependency detected involving "${achievement.id}".`);
    }
  }

  if (errors.length > 0) {
    console.error("Achievement catalog validation failed:");
    errors.forEach((error) => console.error(" -", error));
    alert("Achievement catalog has errors. Check console.");
  } else {
    debugLog("Achievement catalog validation passed.");
  }
}

// =========================
// Core State Logic
// =========================

function createBaseAction(actionType) {
  return {
    actionId: crypto.randomUUID(),
    actionType,
    actionAt: new Date().toISOString()
  };
}

function addAction(action) {
  runState.actions.push(action);
  runState.redoStack = [];
}

function rebuildDerivedStateFromActions() {
  const pokemon = [];
  const fusions = [];
  const battles = [];

  for (const action of runState.actions) {
    switch (action.actionType) {
      case "catch": {
        if (!action.isFusion) {
          const species = speciesById[action.speciesId];
          if (!species) break;

          pokemon.push({
            pokemonId: action.caughtPokemonId,
            speciesId: action.speciesId,
            speciesName: species.name,
            variant: species.variant || "",
            nickname: "",
            locationId: action.locationId || "",
            catchType: action.catchType || "",
            status: "alive",
            activeFusionId: null,
            createdActionId: action.actionId,
            createdAt: action.actionAt
          });
        } else {
          const headSpecies = speciesById[action.headSpeciesId];
          const bodySpecies = speciesById[action.bodySpeciesId];
          if (!headSpecies || !bodySpecies) break;

          pokemon.push({
            pokemonId: action.headPokemonId,
            speciesId: action.headSpeciesId,
            speciesName: headSpecies.name,
            variant: headSpecies.variant || "",
            nickname: "",
            locationId: action.locationId || "",
            catchType: action.catchType || "",
            status: "alive",
            activeFusionId: action.caughtFusionId,
            createdActionId: action.actionId,
            createdAt: action.actionAt
          });

          pokemon.push({
            pokemonId: action.bodyPokemonId,
            speciesId: action.bodySpeciesId,
            speciesName: bodySpecies.name,
            variant: bodySpecies.variant || "",
            nickname: "",
            locationId: action.locationId || "",
            catchType: action.catchType || "",
            status: "alive",
            activeFusionId: action.caughtFusionId,
            createdActionId: action.actionId,
            createdAt: action.actionAt
          });

          fusions.push({
            fusionId: action.caughtFusionId,
            headPokemonId: action.headPokemonId,
            bodyPokemonId: action.bodyPokemonId,
            createdActionId: action.actionId,
            createdAt: action.actionAt,
            status: "active",
            deathNote: ""
          });
        }
        break;
      }

      case "death": {
        if (action.targetType === "pokemon") {
          const targetPokemon = pokemon.find((p) => p.pokemonId === action.targetId);
          if (!targetPokemon) break;

          targetPokemon.status = "dead";
          targetPokemon.deathNote = action.note || "";

          if (targetPokemon.activeFusionId) {
            const linkedFusion = fusions.find((f) => f.fusionId === targetPokemon.activeFusionId);
            if (linkedFusion && linkedFusion.status !== "dead") {
              linkedFusion.status = "dead";
              linkedFusion.deathNote = action.note || "";

              const head = pokemon.find((p) => p.pokemonId === linkedFusion.headPokemonId);
              const body = pokemon.find((p) => p.pokemonId === linkedFusion.bodyPokemonId);

              if (head) {
                head.status = "dead";
                head.deathNote = action.note || "";
              }

              if (body) {
                body.status = "dead";
                body.deathNote = action.note || "";
              }
            }
          }

          break;
        }

        if (action.targetType === "fusion") {
          const targetFusion = fusions.find((f) => f.fusionId === action.targetId);
          if (!targetFusion) break;

          targetFusion.status = "dead";
          targetFusion.deathNote = action.note || "";

          const head = pokemon.find((p) => p.pokemonId === targetFusion.headPokemonId);
          const body = pokemon.find((p) => p.pokemonId === targetFusion.bodyPokemonId);

          if (head) {
            head.status = "dead";
            head.deathNote = action.note || "";
          }

          if (body) {
            body.status = "dead";
            body.deathNote = action.note || "";
          }
        }

        break;
      }

      case "fusion": {
        const head = pokemon.find((p) => p.pokemonId === action.headPokemonId);
        const body = pokemon.find((p) => p.pokemonId === action.bodyPokemonId);

        if (!head || !body) break;
        if (head.status !== "alive" || body.status !== "alive") break;
        if (head.activeFusionId || body.activeFusionId) break;

        fusions.push({
          fusionId: action.fusionId,
          headPokemonId: action.headPokemonId,
          bodyPokemonId: action.bodyPokemonId,
          createdActionId: action.actionId,
          createdAt: action.actionAt,
          status: "active",
          deathNote: ""
        });

        head.activeFusionId = action.fusionId;
        body.activeFusionId = action.fusionId;
        break;
      }

      case "battle": {
        battles.push({
          battleId: action.actionId,
          battleType: action.battleType || "",
          trainerId: action.trainerId || "",
          result: action.result,
          party: Array.isArray(action.party) ? action.party : [],
          createdAt: action.actionAt
        });
        break;
      }
    }
  }

  runState.pokemon = pokemon;
  runState.fusions = fusions;
  runState.battles = battles;
}

function getAvailableRP() {
  return runState.rp.achievementEarned + runState.rp.bonusEarned - runState.rp.spent;
}

function updateAndSave() {
  rebuildDerivedStateFromActions();
  const achievementChanges = evaluateAchievements();
  achievementChanges.newlyUnlocked.forEach((id) => {
    const achievement = achievementCatalog.find((a) => a.id === id);
    if (!achievement) return;

    console.log("Achievement unlocked:", achievement.name);

    popValue(document.getElementById("rp-earned"));
  });
  saveRunState(runState);
  renderRun();

  debugLog("Achievement changes:", achievementChanges);
}


// =========================
// Achievement Logic
// =========================

function isPreviousAchievementUnlocked(achievement, progressMap) {
  if (!achievement.previousAchievement) {
    return true;
  }

  return !!progressMap[achievement.previousAchievement]?.unlocked;
}

function countActionsByType(actionType) {
  return runState.actions.filter((action) => action.actionType === actionType).length;
}

function countBattleResults(result) {
  return runState.actions.filter(
    (action) => action.actionType === "battle" && action.result === result
  ).length;
}

function countBattleFusionWins() {
  return runState.actions.filter((action) => {
    if (action.actionType !== "battle" || action.result !== "win") {
      return false;
    }

    return Array.isArray(action.party) &&
      action.party.some((member) => member.entityType === "fusion");
  }).length;
}

function doesAchievementMeetCondition(achievement, progressMap) {
  if (!isPreviousAchievementUnlocked(achievement, progressMap)) {
    return false;
  }

  if (achievement.conditionType === "action_count") {
    const count = countActionsByType(achievement.actionType);
    return count >= (achievement.target || 1);
  }

  if (achievement.conditionType === "battle_result") {
    const count = countBattleResults(achievement.result);
    return count >= (achievement.target || 1);
  }

  if (achievement.conditionType === "battle_used_fusion_win") {
    const count = countBattleFusionWins();
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
  let nextProgress = structuredClone(previousProgress);

  const now = new Date().toISOString();
  let changed = true;
  let safetyCounter = 0;
  const maxPasses = achievementCatalog.length + 5;

  while (changed) {
    changed = false;
    safetyCounter += 1;

    if (safetyCounter > maxPasses) {
      console.error("Achievement evaluation exceeded safe pass limit.");
      break;
    }

    achievementCatalog.forEach((achievement) => {
      const previouslyUnlocked = !!nextProgress[achievement.id]?.unlocked;
      const meetsCondition = doesAchievementMeetCondition(achievement, nextProgress);

      if (meetsCondition && !previouslyUnlocked) {
        nextProgress[achievement.id] = {
          unlocked: true,
          unlockedAt: previousProgress[achievement.id]?.unlockedAt || now
        };
        changed = true;
      }

      if (!meetsCondition && previouslyUnlocked) {
        delete nextProgress[achievement.id];
        changed = true;
      }
    });
  }

  const newlyUnlocked = [];
  const newlyRemoved = [];

  achievementCatalog.forEach((achievement) => {
    const wasUnlocked = !!previousProgress[achievement.id]?.unlocked;
    const isUnlocked = !!nextProgress[achievement.id]?.unlocked;

    if (!wasUnlocked && isUnlocked) {
      newlyUnlocked.push(achievement.id);
    }

    if (wasUnlocked && !isUnlocked) {
      newlyRemoved.push(achievement.id);
    }
  });

  runState.achievementProgress = nextProgress;
  runState.rp.achievementEarned = calculateAchievementEarnedRP(nextProgress);

  return {
    newlyUnlocked,
    newlyRemoved
  };
}


// =========================
// Rendering
// =========================

function renderRun() {
  document.getElementById("run-name").value = runState.meta.runName;
  document.getElementById("rp-earned").textContent =
    runState.rp.achievementEarned + runState.rp.bonusEarned;
  document.getElementById("rp-spent").textContent = runState.rp.spent;
  document.getElementById("rp-available").textContent = getAvailableRP();

  renderFusionFlowerWidget();
  renderActionLog();
  renderAchievements();

  const undoBtn = document.getElementById("undo-action-btn");
  const redoBtn = document.getElementById("redo-action-btn");

  if (undoBtn) undoBtn.disabled = !Array.isArray(runState.actions) || runState.actions.length === 0;
  if (redoBtn) redoBtn.disabled = !Array.isArray(runState.redoStack) || runState.redoStack.length === 0;
}

function renderActionLog() {
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
      timeSpan.textContent = formatActionTimestamp(action.actionAt);

      const deleteButton = document.createElement("button");
      deleteButton.className = "action-delete-btn";
      deleteButton.type = "button";
      deleteButton.textContent = "×";
      deleteButton.setAttribute("aria-label", "Delete action");
      deleteButton.addEventListener("click", () => handleDeleteAction(action.actionId));

      rightGroup.appendChild(timeSpan);
      rightGroup.appendChild(deleteButton);

      li.appendChild(textSpan);
      li.appendChild(rightGroup);

      list.appendChild(li);
    });
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

function renderActionFields() {
  debugLog("renderActionFields fired");

  const type = document.getElementById("action-type").value;
  const container = document.getElementById("action-fields");

  debugLog("action-fields container:", container);
  debugLog("action type:", type);

  if (!container) return;

  container.innerHTML = "";

    if (type === "catch") {
      container.innerHTML = `
        <div class="field-row">
          <label for="catch-type">Catch Type</label>
          <select id="catch-type" required>
            <option value="">Select catch type</option>
            <option value="wild">Wild</option>
            <option value="starter">Starter</option>
            <option value="gift">Gift</option>
            <option value="trade">Trade</option>
          </select>
        </div>

        <div class="field-row">
          <label for="catch-location">Location</label>
          <select id="catch-location" required>
            <option value="">Select a location</option>
          </select>
        </div>

        <div class="field-row">
          <label>
            <input type="checkbox" id="catch-is-fusion" />
            Wild / caught fusion
          </label>
        </div>

        <div id="catch-normal-fields">
          <div class="field-row">
            <label for="catch-species">Species</label>
            <select id="catch-species" required>
              <option value="">Select a species</option>
            </select>
          </div>
        </div>

        <div id="catch-fusion-fields" style="display:none;">
          <div class="field-row">
            <label for="catch-head-species">Head Species</label>
            <select id="catch-head-species">
              <option value="">Select head species</option>
            </select>
          </div>

          <div class="field-row">
            <label for="catch-body-species">Body Species</label>
            <select id="catch-body-species">
              <option value="">Select body species</option>
            </select>
          </div>
        </div>
      `;

      populateSpeciesSelect("catch-species");
      populateSpeciesSelect("catch-head-species");
      populateSpeciesSelect("catch-body-species");
      populateLocationSelect("catch-location");

      const fusionCheckbox = document.getElementById("catch-is-fusion");
      const normalFields = document.getElementById("catch-normal-fields");
      const fusionFields = document.getElementById("catch-fusion-fields");

      fusionCheckbox.addEventListener("change", () => {
        const isFusion = fusionCheckbox.checked;
        normalFields.style.display = isFusion ? "none" : "";
        fusionFields.style.display = isFusion ? "" : "none";
      });
    }

  if (type === "death") {
    const alivePokemon = runState.pokemon.filter(
      (p) => p.status === "alive" && !p.activeFusionId
    );
    const activeFusions = runState.fusions.filter((f) => f.status === "active");

    const pokemonOptions = alivePokemon.map((p) =>
      `<option value="pokemon:${p.pokemonId}">Pokémon — ${p.speciesName}${p.variant ? ` (${p.variant})` : ""}</option>`
    ).join("");

    const fusionOptions = activeFusions.map((f) => {
      const head = runState.pokemon.find((p) => p.pokemonId === f.headPokemonId);
      const body = runState.pokemon.find((p) => p.pokemonId === f.bodyPokemonId);

      const headName = head ? `${head.speciesName}${head.variant ? ` (${head.variant})` : ""}` : "Unknown";
      const bodyName = body ? `${body.speciesName}${body.variant ? ` (${body.variant})` : ""}` : "Unknown";

      return `<option value="fusion:${f.fusionId}">Fusion — ${headName} + ${bodyName}</option>`;
    }).join("");

    container.innerHTML = `
      <div class="field-row">
        <label for="death-target">Target</label>
        <select id="death-target">
          <option value="">Select a target</option>
          ${fusionOptions}
          ${pokemonOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="death-note">Death Note (optional)</label>
        <input id="death-note" type="text" placeholder="e.g. Crit from Brock's Onix" />
      </div>
    `;
  }

  if (type === "fusion") {
    const available = runState.pokemon.filter(
      (p) => p.status === "alive" && !p.activeFusionId
    );

    const options = available.map((p) =>
      `<option value="${p.pokemonId}">${p.speciesName}${p.variant ? ` (${p.variant})` : ""}</option>`
    ).join("");

    container.innerHTML = `
      <div class="field-row">
        <label for="fusion-head">Head Pokémon</label>
        <select id="fusion-head">
          <option value="">Select a Pokémon</option>
          ${options}
        </select>
      </div>

      <div class="field-row">
        <label for="fusion-body">Body Pokémon</label>
        <select id="fusion-body">
          <option value="">Select a Pokémon</option>
          ${options}
        </select>
      </div>
    `;
  }

  if (type === "battle") {
    const partyOptions = getBattleEligibleEntities()
      .map((entry) => {
        const prefix = entry.entityType === "fusion" ? "Fusion" : "Pokémon";
        return `<option value="${entry.entityType}:${entry.entityId}">${prefix} — ${entry.label}</option>`;
      })
      .join("");

    container.innerHTML = `
      <div class="field-row">
        <label for="battle-type">Battle Type</label>
        <select id="battle-type">
          <option value="">Select a battle type</option>
          <option value="gym">Gym</option>
          <option value="rival">Rival</option>
          <option value="elite_four">Elite Four</option>
          <option value="champion">Champion</option>
        </select>
      </div>

      <div class="field-row">
        <label for="battle-trainer">Trainer</label>
        <select id="battle-trainer">
          <option value="">Select a trainer</option>
        </select>
      </div>

      <div class="field-row">
        <label for="battle-result">Result</label>
        <select id="battle-result">
          <option value="win">Win</option>
          <option value="loss">Loss</option>
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-1">Party Slot 1</label>
        <select id="battle-party-1">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-2">Party Slot 2</label>
        <select id="battle-party-2">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-3">Party Slot 3</label>
        <select id="battle-party-3">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-4">Party Slot 4</label>
        <select id="battle-party-4">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-5">Party Slot 5</label>
        <select id="battle-party-5">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>

      <div class="field-row">
        <label for="battle-party-6">Party Slot 6</label>
        <select id="battle-party-6">
          <option value="">Empty</option>
          ${partyOptions}
        </select>
      </div>
    `;

    const battleTypeSelect = document.getElementById("battle-type");
    const battleTrainerSelectId = "battle-trainer";

    battleTypeSelect.addEventListener("change", () => {
      const battleType = battleTypeSelect.value;
      populateBattleTrainerSelect(battleTrainerSelectId, battleType);
    });
  }
}

function populateSpeciesSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const currentFirstOption = select.querySelector("option");
  const firstOptionText = currentFirstOption?.textContent || "Select a species";

  select.innerHTML = `<option value="">${firstOptionText}</option>`;

  speciesCatalog.forEach((species) => {
    const option = document.createElement("option");
    option.value = species.speciesId;

    const variantText = species.variant ? ` (${species.variant})` : "";
    option.textContent = `${species.name}${variantText}`;

    select.appendChild(option);
  });

  debugLog(`Populated select "${selectId}" with ${speciesCatalog.length} species.`);
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

function renderFusionFlowerWidget() {
  const fusionsEl = document.getElementById("fusions-discovered-value");
  const catchesEl = document.getElementById("catches-available-value");
  const splitsEl = document.getElementById("splits-available-value");

  const nextValues = {
    fusions: getFusionsDiscoveredCount(),
    catches: runState.resources?.catchesAvailable ?? 0,
    splits: runState.resources?.splitsAvailable ?? 0
  };

  function updateValue(el, key) {
    if (!el) return;

    const next = String(nextValues[key]);
    const previous = lastRenderedFusionFlowerValues[key];

    el.textContent = next;

    if (hasRenderedFusionFlowerOnce && previous !== null && String(previous) !== next) {
      popValue(el);

      const petalCard = el.closest(".petal-card");
      const petalWrap = petalCard?.querySelector(".petal-anim-wrap");
      const petalSvg = petalCard?.querySelector(".petal-svg");

      if (petalWrap) {
        pulsePetal(petalWrap);
      }

      if (petalSvg) {
        flashPetal(petalSvg);
      }
    }

    lastRenderedFusionFlowerValues[key] = nextValues[key];
  }

  updateValue(fusionsEl, "fusions");
  updateValue(catchesEl, "catches");
  updateValue(splitsEl, "splits");

  hasRenderedFusionFlowerOnce = true;
}

function popValue(el) {
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

function flashPetal(el) {
  el.classList.remove("flash");
  el.getBoundingClientRect();
  el.classList.add("flash");
}

function pulsePetal(el) {
  el.classList.remove("pulse");
  void el.offsetWidth;
  el.classList.add("pulse");
}

function attachAnimationCleanup() {
  document.querySelectorAll(".petal-value").forEach((el) => {
    el.addEventListener("animationend", () => {
      el.classList.remove("pop");
    });
  });

  document.querySelectorAll(".petal-anim-wrap").forEach((el) => {
    el.addEventListener("animationend", () => {
      el.classList.remove("pulse");
    });
  });

  document.querySelectorAll(".petal-svg").forEach((el) => {
    el.addEventListener("animationend", (event) => {
      if (event.animationName === "petalFlash") {
        el.classList.remove("flash");
      }
    });
  });

}


// =========================
// Helpers
// =========================

function formatActionText(action) {
  if (action.actionType === "catch") {
    if (!action.isFusion) {
      const species = speciesById[action.speciesId];
      const speciesName = species
        ? `${species.name}${species.variant ? ` (${species.variant})` : ""}`
        : action.speciesId;

      return `[CATCH] ${action.catchType} — ${speciesName} — ${action.locationId}`;
    }

    const headSpecies = speciesById[action.headSpeciesId];
    const bodySpecies = speciesById[action.bodySpeciesId];

    const headName = headSpecies
      ? `${headSpecies.name}${headSpecies.variant ? ` (${headSpecies.variant})` : ""}`
      : action.headSpeciesId;

    const bodyName = bodySpecies
      ? `${bodySpecies.name}${bodySpecies.variant ? ` (${bodySpecies.variant})` : ""}`
      : action.bodySpeciesId;

    return `[CATCH] ${action.catchType} fusion — ${headName} + ${bodyName} — ${action.locationId}`;
  }

  if (action.actionType === "death") {
    if (action.targetType === "pokemon") {
      const target = runState.pokemon.find((p) => p.pokemonId === action.targetId);
      const name = target
        ? `${target.speciesName}${target.variant ? ` (${target.variant})` : ""}`
        : "Unknown Pokémon";

      return `[DEATH] ${name}`;
    }

    if (action.targetType === "fusion") {
      const fusion = runState.fusions.find((f) => f.fusionId === action.targetId);
      if (!fusion) {
        return `[DEATH] Unknown Fusion`;
      }

      const head = runState.pokemon.find((p) => p.pokemonId === fusion.headPokemonId);
      const body = runState.pokemon.find((p) => p.pokemonId === fusion.bodyPokemonId);

      const headName = head ? `${head.speciesName}${head.variant ? ` (${head.variant})` : ""}` : "Unknown";
      const bodyName = body ? `${body.speciesName}${body.variant ? ` (${body.variant})` : ""}` : "Unknown";

      return `[DEATH] Fusion — ${headName} + ${bodyName}`;
    }

    return `[DEATH] Unknown Target`;
  }

  if (action.actionType === "fusion") {
    const head = runState.pokemon.find((p) => p.pokemonId === action.headPokemonId);
    const body = runState.pokemon.find((p) => p.pokemonId === action.bodyPokemonId);

    const headName = head ? `${head.speciesName}${head.variant ? ` (${head.variant})` : ""}` : "Unknown";
    const bodyName = body ? `${body.speciesName}${body.variant ? ` (${body.variant})` : ""}` : "Unknown";

    return `[FUSION] ${headName} + ${bodyName}`;
  }

  if (action.actionType === "battle") {
    const trainer = trainerById[action.trainerId];
    const trainerName = trainer ? trainer.name : action.trainerId || "Unknown Trainer";
    const battleTypeLabel = action.battleType ? action.battleType.replace(/_/g, " ") : "battle";

    const partySummary = Array.isArray(action.party)
      ? action.party.map((member) => {
          if (member.entityType === "pokemon") {
            const pokemon = runState.pokemon.find((p) => p.pokemonId === member.entityId);
            return pokemon
              ? `${pokemon.speciesName}${pokemon.variant ? ` (${pokemon.variant})` : ""}`
              : "Unknown Pokémon";
          }

          if (member.entityType === "fusion") {
            const fusion = runState.fusions.find((f) => f.fusionId === member.entityId);
            if (!fusion) return "Unknown Fusion";

            const head = runState.pokemon.find((p) => p.pokemonId === fusion.headPokemonId);
            const body = runState.pokemon.find((p) => p.pokemonId === fusion.bodyPokemonId);

            const headName = head ? `${head.speciesName}${head.variant ? ` (${head.variant})` : ""}` : "Unknown";
            const bodyName = body ? `${body.speciesName}${body.variant ? ` (${body.variant})` : ""}` : "Unknown";

            return `${headName} + ${bodyName}`;
          }

          return "Unknown Member";
        }).join(", ")
      : "";

    return `[BATTLE] ${battleTypeLabel} — ${trainerName} — ${action.result}${partySummary ? ` — Party: ${partySummary}` : ""}`;
  }

  return `[UNKNOWN ACTION]`;
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

function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

function getFusionsDiscoveredCount() {
  const discovered = new Set();

  runState.actions.forEach((action) => {
    if (action.actionType === "fusion") {
      const head = runState.pokemon.find((p) => p.pokemonId === action.headPokemonId);
      const body = runState.pokemon.find((p) => p.pokemonId === action.bodyPokemonId);

      if (!head || !body) return;

      discovered.add(`${head.speciesId}__${body.speciesId}`);
      return;
    }

    if (action.actionType === "catch" && action.isFusion) {
      discovered.add(`${action.headSpeciesId}__${action.bodySpeciesId}`);
    }
  });

  return discovered.size;
}

function populateLocationSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const currentFirstOption = select.querySelector("option");
  const firstOptionText = currentFirstOption?.textContent || "Select a location";

  select.innerHTML = `<option value="">${firstOptionText}</option>`;

  locationCatalog.forEach((location) => {
    const option = document.createElement("option");
    option.value = location.locationId;
    option.textContent = location.name;
    select.appendChild(option);
  });

  debugLog(`Populated select "${selectId}" with ${locationCatalog.length} locations.`);
}

function getBattleEligibleEntities() {
  const standalonePokemon = runState.pokemon
    .filter((p) => p.status === "alive" && !p.activeFusionId)
    .map((p) => ({
      entityType: "pokemon",
      entityId: p.pokemonId,
      label: `${p.speciesName}${p.variant ? ` (${p.variant})` : ""}`
    }));

  const activeFusions = runState.fusions
    .filter((f) => f.status === "active")
    .map((f) => {
      const head = runState.pokemon.find((p) => p.pokemonId === f.headPokemonId);
      const body = runState.pokemon.find((p) => p.pokemonId === f.bodyPokemonId);

      const headName = head ? `${head.speciesName}${head.variant ? ` (${head.variant})` : ""}` : "Unknown";
      const bodyName = body ? `${body.speciesName}${body.variant ? ` (${body.variant})` : ""}` : "Unknown";

      return {
        entityType: "fusion",
        entityId: f.fusionId,
        label: `${headName} + ${bodyName}`
      };
    });

  return [...standalonePokemon, ...activeFusions];
}

function populateBattleTrainerSelect(selectId, battleType) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const filteredTrainers = trainerCatalog.filter(
    (trainer) => trainer.battleType === battleType
  );

  select.innerHTML = `<option value="">Select a trainer</option>`;

  filteredTrainers.forEach((trainer) => {
    const option = document.createElement("option");
    option.value = trainer.trainerId;
    option.textContent = trainer.name;
    select.appendChild(option);
  });

  debugLog(`Populated trainer select "${selectId}" with ${filteredTrainers.length} trainers for battleType "${battleType}".`);
}

// =========================
// Event Handlers
// =========================

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
  runState.rp.bonusEarned += 1;
  updateAndSave();
}

function handleAddSpentRP() {
  runState.rp.spent += 1;
  updateAndSave();
}

function handleAddCatchToken() {
  runState.resources.catchesAvailable += 1;
  updateAndSave();
  renderActionFields();
}

function handleAddSplitToken() {
  runState.resources.splitsAvailable += 1;
  updateAndSave();
  renderActionFields();
}

function handleLogAction(event) {
  event.preventDefault();

  const actionType = document.getElementById("action-type").value;
  const handler = actionHandlers[actionType];

  if (!handler) {
    alert("Unknown action type.");
    return;
  }

  handler();
}

function handleCatchAction() {
  if (runState.resources.catchesAvailable <= 0) {
    alert("You do not have any catches available.");
    return;
  }

  const catchTypeSelect = document.getElementById("catch-type");
  const locationInput = document.getElementById("catch-location");
  const fusionCheckbox = document.getElementById("catch-is-fusion");

  const catchType = catchTypeSelect?.value || "";
  const locationId = locationInput?.value.trim() || "";
  const isFusion = !!fusionCheckbox?.checked;

  if (!catchType || !locationId) {
    alert("Catch actions need both a catch type and a location.");
    return;
  }

  if (!isFusion) {
    const speciesSelect = document.getElementById("catch-species");
    const speciesId = speciesSelect?.value || "";

    if (!speciesId) {
      alert("Please choose a species.");
      return;
    }

    const species = speciesById[speciesId];
    if (!species) {
      alert("Selected species could not be found in the catalog.");
      return;
    }

    const caughtPokemonId = crypto.randomUUID();

    addAction({
      ...createBaseAction("catch"),
      catchType,
      locationId,
      isFusion: false,
      caughtPokemonId,
      speciesId
    });
  } else {
    const headSpeciesSelect = document.getElementById("catch-head-species");
    const bodySpeciesSelect = document.getElementById("catch-body-species");

    const headSpeciesId = headSpeciesSelect?.value || "";
    const bodySpeciesId = bodySpeciesSelect?.value || "";

    if (!headSpeciesId || !bodySpeciesId) {
      alert("Please choose both fusion species.");
      return;
    }

    const headSpecies = speciesById[headSpeciesId];
    const bodySpecies = speciesById[bodySpeciesId];

    if (!headSpecies || !bodySpecies) {
      alert("One or both selected fusion species could not be found in the catalog.");
      return;
    }

    const caughtFusionId = crypto.randomUUID();
    const headPokemonId = crypto.randomUUID();
    const bodyPokemonId = crypto.randomUUID();

    addAction({
      ...createBaseAction("catch"),
      catchType,
      locationId,
      isFusion: true,
      caughtFusionId,
      headPokemonId,
      bodyPokemonId,
      headSpeciesId,
      bodySpeciesId
    });
  }

  runState.resources.catchesAvailable -= 1;
  updateAndSave();
  renderActionFields();
}

function handleDeathAction() {
  const deathTarget = document.getElementById("death-target");
  const deathNote = document.getElementById("death-note");

  const rawTarget = deathTarget?.value || "";
  const note = deathNote?.value.trim() || "";

  if (!rawTarget) {
    alert("Please choose a target to mark as dead.");
    return;
  }

  const [targetType, targetId] = rawTarget.split(":");

  if (!targetType || !targetId) {
    alert("Invalid death target selected.");
    return;
  }

  addAction({
    ...createBaseAction("death"),
    targetType,
    targetId,
    note
  });

  updateAndSave();
  renderActionFields();
}

function handleFusionAction() {
  const fusionHead = document.getElementById("fusion-head");
  const fusionBody = document.getElementById("fusion-body");

  const headPokemonId = fusionHead?.value || "";
  const bodyPokemonId = fusionBody?.value || "";

  if (!headPokemonId || !bodyPokemonId) {
    alert("Please choose both fusion components.");
    return;
  }

  if (headPokemonId === bodyPokemonId) {
    alert("A Pokémon cannot fuse with itself.");
    return;
  }

  const headPokemon = runState.pokemon.find((p) => p.pokemonId === headPokemonId);
  const bodyPokemon = runState.pokemon.find((p) => p.pokemonId === bodyPokemonId);

  if (!headPokemon || !bodyPokemon) {
    alert("One or both selected Pokémon could not be found.");
    return;
  }

  if (headPokemon.status !== "alive" || bodyPokemon.status !== "alive") {
    alert("Only living Pokémon can be fused.");
    return;
  }

  if (headPokemon.activeFusionId || bodyPokemon.activeFusionId) {
    alert("One or both selected Pokémon are already part of an active fusion.");
    return;
  }

  const fusionId = crypto.randomUUID();

  addAction({
    ...createBaseAction("fusion"),
    fusionId,
    headPokemonId,
    bodyPokemonId
  });

  updateAndSave();
  renderActionFields();
}

function handleBattleAction() {
  const battleTypeSelect = document.getElementById("battle-type");
  const battleTrainerSelect = document.getElementById("battle-trainer");
  const battleResultSelect = document.getElementById("battle-result");

  const battleType = battleTypeSelect?.value || "";
  const trainerId = battleTrainerSelect?.value || "";
  const result = battleResultSelect?.value || "win";

  if (!battleType) {
    alert("Please choose a battle type.");
    return;
  }

  if (!trainerId) {
    alert("Please choose a trainer.");
    return;
  }

  const trainer = trainerById[trainerId];
  if (!trainer) {
    alert("Selected trainer could not be found.");
    return;
  }

  const rawPartyValues = [
    document.getElementById("battle-party-1")?.value || "",
    document.getElementById("battle-party-2")?.value || "",
    document.getElementById("battle-party-3")?.value || "",
    document.getElementById("battle-party-4")?.value || "",
    document.getElementById("battle-party-5")?.value || "",
    document.getElementById("battle-party-6")?.value || ""
  ];

  const nonEmptyPartyValues = rawPartyValues.filter(Boolean);

  if (nonEmptyPartyValues.length === 0) {
    alert("Please choose at least one party member.");
    return;
  }

  const uniqueValues = new Set(nonEmptyPartyValues);
  if (uniqueValues.size !== nonEmptyPartyValues.length) {
    alert("The same party member cannot be selected more than once.");
    return;
  }

  const eligibleEntities = getBattleEligibleEntities();
  const eligibleSet = new Set(
    eligibleEntities.map((entry) => `${entry.entityType}:${entry.entityId}`)
  );

  const hasInvalidSelection = nonEmptyPartyValues.some((value) => !eligibleSet.has(value));
  if (hasInvalidSelection) {
    alert("One or more selected party members are no longer eligible.");
    return;
  }

  const party = nonEmptyPartyValues.map((value) => {
    const [entityType, entityId] = value.split(":");
    return { entityType, entityId };
  });

  addAction({
    ...createBaseAction("battle"),
    battleType,
    trainerId,
    result,
    party
  });

  updateAndSave();
  renderActionFields();
}

function handleUndoAction() {
  if (runState.actions.length === 0) return;

  const action = runState.actions.pop();
  runState.redoStack.push(action);

  updateAndSave();
}

function handleRedoAction() {
  if (runState.redoStack.length === 0) return;

  const action = runState.redoStack.pop();
  runState.actions.push(action);

  updateAndSave();
}

function handleDeleteAction(actionId) {
  const confirmed = window.confirm("Delete this action?");
  if (!confirmed) return;

  runState.actions = runState.actions.filter((action) => action.actionId !== actionId);
  runState.redoStack = [];

  updateAndSave();
  renderActionFields();
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

      if (!parsed.meta || !parsed.rp || !Array.isArray(parsed.actions)) {
        throw new Error("Invalid save file format.");
      }
      
      runState = normalizeRunState(parsed);
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




// =========================
// Event Listener Wiring
// =========================

function attachEventListeners() {
  document.getElementById("save-run-name-btn").addEventListener("click", handleSaveRunName);
  document.getElementById("new-run-btn").addEventListener("click", handleNewRun);
  document.getElementById("add-earned-rp-btn").addEventListener("click", handleAddEarnedRP);
  document.getElementById("add-spent-rp-btn").addEventListener("click", handleAddSpentRP);
  document.getElementById("add-catch-token-btn").addEventListener("click", handleAddCatchToken);
  document.getElementById("add-split-token-btn").addEventListener("click", handleAddSplitToken);
  document.getElementById("action-form").addEventListener("submit", handleLogAction);
  document.getElementById("action-type").addEventListener("change", renderActionFields);
  document.getElementById("export-run-btn").addEventListener("click", exportRun);
  document.getElementById("import-run-input").addEventListener("change", importRun);
  document.getElementById("undo-action-btn").addEventListener("click", handleUndoAction);
  document.getElementById("redo-action-btn").addEventListener("click", handleRedoAction);
}

function attachTabEventListeners() {
  const buttons = document.querySelectorAll(".tab-button");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });
}


// =========================
// Initialization
// =========================

function initializeDebugMode() {
  const debugPanel = document.getElementById("debug-panel");
  if (debugPanel && !DEBUG_MODE) {
    debugPanel.style.display = "none";
  }
}

async function init() {
  await loadAchievementCatalog();
  await loadSpeciesCatalog();
  await loadLocationCatalog();
  await loadTrainerCatalog();
  attachEventListeners();
  attachTabEventListeners();
  attachAnimationCleanup();
  initializeDebugMode();
  renderActionFields();
  renderRun();
}

init();