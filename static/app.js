// Evolution Lab - Main Application

const canvas = document.getElementById('canvas');
const connections = document.getElementById('connections');
const addBtn = document.getElementById('add-btn');
const breedBtn = document.getElementById('breed-btn');
const modal = document.getElementById('modal');
const promptInput = document.getElementById('prompt-input');
const cancelBtn = document.getElementById('cancel-btn');
const createBtn = document.getElementById('create-btn');
const loading = document.getElementById('loading');
const randomBtn = document.getElementById('random-btn');
const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('img');
const lightboxName = lightbox.querySelector('.lightbox-name');

// State
let animals = [];
let selectedCards = [];
let draggedCard = null;
let dragOffset = { x: 0, y: 0 };

// Connections between parents and children
let familyLines = []; // { parent1Id, parent2Id, childId }

// Initialize
function init() {
    addBtn.addEventListener('click', openModal);
    cancelBtn.addEventListener('click', closeModal);
    createBtn.addEventListener('click', createAnimal);
    breedBtn.addEventListener('click', breedSelected);

    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createAnimal();
        if (e.key === 'Escape') closeModal();
    });

    randomBtn.addEventListener('click', generateRandomPrompt);

    // Global mouse events for dragging
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Click on canvas to deselect
    canvas.addEventListener('click', (e) => {
        if (e.target === canvas || e.target === connections) {
            deselectAll();
        }
    });

    // Lightbox close on click
    lightbox.addEventListener('click', closeLightbox);

    // Load saved state from server
    loadState();
}

// Modal functions
function openModal() {
    modal.classList.remove('hidden');
    promptInput.value = '';
    promptInput.focus();
}

function closeModal() {
    modal.classList.add('hidden');
}

// Generate random creature prompt
async function generateRandomPrompt() {
    randomBtn.disabled = true;
    randomBtn.textContent = '...';

    try {
        const response = await fetch('/api/random-prompt');
        const data = await response.json();

        if (data.prompt) {
            promptInput.value = data.prompt;
            promptInput.focus();
        }
    } catch (error) {
        console.error('Failed to generate random prompt:', error);
    } finally {
        randomBtn.disabled = false;
        randomBtn.textContent = '🎲';
    }
}

// Create new animal from prompt
async function createAnimal() {
    const prompt = promptInput.value.trim() || 'a cute fantasy creature';
    closeModal();

    // Create placeholder card immediately
    const x = 100 + Math.random() * (window.innerWidth - 300);
    const y = 100 + Math.random() * (window.innerHeight - 300);
    const tempId = 'temp-' + Date.now();

    addLoadingCard(tempId, prompt, x, y, 1);

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        const data = await response.json();

        if (data.error) {
            removeCard(tempId);
            alert('Error: ' + data.error);
            return;
        }

        // Replace loading card with real card
        replaceLoadingCard(tempId, data, 1);
        saveState();

    } catch (error) {
        removeCard(tempId);
        alert('Failed to generate animal: ' + error.message);
    }
}

// Breed two selected animals
async function breedSelected() {
    if (selectedCards.length !== 2) return;

    const parent1 = animals.find(a => a.id === selectedCards[0]);
    const parent2 = animals.find(a => a.id === selectedCards[1]);

    if (!parent1 || !parent2) return;

    // Position child between parents
    const parent1Card = document.querySelector(`[data-id="${parent1.id}"]`);
    const parent2Card = document.querySelector(`[data-id="${parent2.id}"]`);

    const p1Rect = parent1Card.getBoundingClientRect();
    const p2Rect = parent2Card.getBoundingClientRect();

    const childX = (p1Rect.left + p2Rect.left) / 2;
    const childY = Math.max(p1Rect.bottom, p2Rect.bottom) + 50;

    const generation = Math.max(parent1.generation, parent2.generation) + 1;
    const tempId = 'temp-' + Date.now();

    // Create loading card immediately
    addLoadingCard(tempId, `Breeding ${parent1.name} + ${parent2.name}...`, childX, childY, generation);

    // Add temporary family lines
    const tempLine = {
        parent1Id: parent1.id,
        parent2Id: parent2.id,
        childId: tempId
    };
    familyLines.push(tempLine);
    updateConnections();
    deselectAll();

    try {
        const response = await fetch('/api/breed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                parent1_id: parent1.id,
                parent2_id: parent2.id,
                parent1_name: parent1.name,
                parent2_name: parent2.name
            })
        });

        const data = await response.json();

        if (data.error) {
            removeCard(tempId);
            familyLines = familyLines.filter(l => l.childId !== tempId);
            updateConnections();
            alert('Error: ' + data.error);
            return;
        }

        // Update family line with real ID
        tempLine.childId = data.id;

        // Replace loading card with real card
        replaceLoadingCard(tempId, data, generation);
        updateConnections();
        saveState();

    } catch (error) {
        removeCard(tempId);
        familyLines = familyLines.filter(l => l.childId !== tempId);
        updateConnections();
        alert('Failed to breed: ' + error.message);
    }
}

// Add animal card to canvas
function addAnimalCard(data, x, y, generation) {
    const card = document.createElement('div');
    card.className = 'animal-card';
    card.dataset.id = data.id;
    card.style.left = x + 'px';
    card.style.top = y + 'px';

    card.innerHTML = `
        <img src="${data.image_url}" alt="${data.name}" draggable="false">
        <div class="name" title="Double-click to edit">${data.name}</div>
        <div class="generation">Gen ${generation}</div>
        <button class="zoom-btn" title="Enlarge image">🔍</button>
        <button class="breed-link-btn" title="Click another card to breed">🔗</button>
    `;

    // Mouse events for dragging
    card.addEventListener('mousedown', (e) => onCardMouseDown(e, card));
    card.addEventListener('click', (e) => onCardClick(e, card));

    // Double-click on name to edit
    const nameEl = card.querySelector('.name');
    nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        editName(card, data.id);
    });

    // Breed link button
    const breedLinkBtn = card.querySelector('.breed-link-btn');
    breedLinkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBreedMode(card, data.id);
    });

    // Zoom button
    const zoomBtn = card.querySelector('.zoom-btn');
    zoomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(data.image_url, data.name);
    });

    canvas.appendChild(card);

    animals.push({
        id: data.id,
        name: data.name,
        image_url: data.image_url,
        generation: generation,
        x: x,
        y: y
    });
}

// Add a loading placeholder card
function addLoadingCard(tempId, description, x, y, generation) {
    const card = document.createElement('div');
    card.className = 'animal-card loading-card';
    card.dataset.id = tempId;
    card.style.left = x + 'px';
    card.style.top = y + 'px';

    card.innerHTML = `
        <div class="card-loader">
            <div class="card-spinner"></div>
        </div>
        <div class="name loading-name">${description}</div>
        <div class="generation">Gen ${generation}</div>
    `;

    // Allow dragging loading cards
    card.addEventListener('mousedown', (e) => onCardMouseDown(e, card));

    canvas.appendChild(card);

    // Add to animals array with temp data
    animals.push({
        id: tempId,
        name: description,
        image_url: '',
        generation: generation,
        x: x,
        y: y,
        isLoading: true
    });
}

// Replace loading card with real animal card
function replaceLoadingCard(tempId, data, generation) {
    const card = document.querySelector(`[data-id="${tempId}"]`);
    if (!card) return;

    // Get current position (might have been dragged)
    const x = parseInt(card.style.left);
    const y = parseInt(card.style.top);

    // Remove old card
    card.remove();

    // Remove from animals array
    animals = animals.filter(a => a.id !== tempId);

    // Add real card at same position
    addAnimalCard(data, x, y, generation);
}

// Remove a card by ID
function removeCard(cardId) {
    const card = document.querySelector(`[data-id="${cardId}"]`);
    if (card) card.remove();
    animals = animals.filter(a => a.id !== cardId);
}

// Edit animal name
function editName(card, animalId) {
    const nameEl = card.querySelector('.name');
    const currentName = nameEl.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'name-input';

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const saveName = () => {
        const newName = input.value.trim() || currentName;
        const newNameEl = document.createElement('div');
        newNameEl.className = 'name';
        newNameEl.title = 'Double-click to edit';
        newNameEl.textContent = newName;

        // Update animal in state
        const animal = animals.find(a => a.id === animalId);
        if (animal) {
            animal.name = newName;
        }

        input.replaceWith(newNameEl);

        // Re-add double-click listener
        newNameEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            editName(card, animalId);
        });

        saveState();
    };

    input.addEventListener('blur', saveName);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            input.value = currentName;
            input.blur();
        }
    });
}

// Toggle breed mode on a card
function toggleBreedMode(card, animalId) {
    const wasActive = card.classList.contains('breed-mode');

    // Remove breed mode from all cards
    document.querySelectorAll('.animal-card.breed-mode').forEach(c => {
        c.classList.remove('breed-mode');
    });

    if (!wasActive) {
        // Activate breed mode on this card
        card.classList.add('breed-mode');

        // If another card is selected, breed with it
        if (selectedCards.length === 1 && selectedCards[0] !== animalId) {
            // Select this card too and breed
            card.classList.add('selected');
            selectedCards.push(animalId);
            updateBreedButton();
            breedSelected();
        } else {
            // Select this card and wait for another
            deselectAll();
            card.classList.add('selected');
            selectedCards.push(animalId);
            updateBreedButton();
        }
    }
}

// Card mouse down - start drag
function onCardMouseDown(e, card) {
    if (e.button !== 0) return; // Only left click
    if (e.target.classList.contains('breed-link-btn')) return; // Don't drag when clicking breed button
    if (e.target.classList.contains('name-input')) return; // Don't drag when editing name

    draggedCard = card;
    draggedCard.classList.add('dragging');

    const rect = card.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    e.preventDefault();
}

// Global mouse move
function onMouseMove(e) {
    if (!draggedCard) return;

    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;

    draggedCard.style.left = x + 'px';
    draggedCard.style.top = y + 'px';

    // Update animal position in state
    const id = draggedCard.dataset.id;
    const animal = animals.find(a => a.id === id);
    if (animal) {
        animal.x = x;
        animal.y = y;
    }

    updateConnections();
}

// Global mouse up
function onMouseUp() {
    if (draggedCard) {
        draggedCard.classList.remove('dragging');
        draggedCard = null;
        saveState(); // Save position after drag
    }
}

// Card click - select/deselect
function onCardClick(e, card) {
    e.stopPropagation();
    if (e.target.classList.contains('breed-link-btn')) return;
    if (e.target.classList.contains('name-input')) return;

    const id = card.dataset.id;

    // Check if another card is in breed mode
    const breedModeCard = document.querySelector('.animal-card.breed-mode');
    if (breedModeCard && breedModeCard !== card) {
        // Breed these two
        const breedModeId = breedModeCard.dataset.id;
        deselectAll();
        breedModeCard.classList.remove('breed-mode');
        breedModeCard.classList.add('selected');
        card.classList.add('selected');
        selectedCards = [breedModeId, id];
        updateBreedButton();
        breedSelected();
        return;
    }

    if (card.classList.contains('selected')) {
        // Deselect
        card.classList.remove('selected');
        card.classList.remove('breed-mode');
        selectedCards = selectedCards.filter(sid => sid !== id);
    } else {
        // Select (max 2)
        if (selectedCards.length >= 2) {
            // Deselect oldest
            const oldestId = selectedCards.shift();
            document.querySelector(`[data-id="${oldestId}"]`)?.classList.remove('selected');
        }
        card.classList.add('selected');
        selectedCards.push(id);
    }

    updateBreedButton();
}

// Deselect all cards
function deselectAll() {
    document.querySelectorAll('.animal-card.selected').forEach(card => {
        card.classList.remove('selected');
        card.classList.remove('breed-mode');
    });
    selectedCards = [];
    updateBreedButton();
}

// Show/hide breed button based on selection
function updateBreedButton() {
    if (selectedCards.length === 2) {
        breedBtn.classList.remove('hidden');
    } else {
        breedBtn.classList.add('hidden');
    }
}

// Update SVG connection lines
function updateConnections() {
    connections.innerHTML = '';

    for (const line of familyLines) {
        const parent1Card = document.querySelector(`[data-id="${line.parent1Id}"]`);
        const parent2Card = document.querySelector(`[data-id="${line.parent2Id}"]`);
        const childCard = document.querySelector(`[data-id="${line.childId}"]`);

        if (!parent1Card || !parent2Card || !childCard) continue;

        const p1Rect = parent1Card.getBoundingClientRect();
        const p2Rect = parent2Card.getBoundingClientRect();
        const childRect = childCard.getBoundingClientRect();

        // Center points
        const p1Center = {
            x: p1Rect.left + p1Rect.width / 2,
            y: p1Rect.top + p1Rect.height / 2
        };
        const p2Center = {
            x: p2Rect.left + p2Rect.width / 2,
            y: p2Rect.top + p2Rect.height / 2
        };
        const childCenter = {
            x: childRect.left + childRect.width / 2,
            y: childRect.top + childRect.height / 2
        };

        // Line from parent 1 to child
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', p1Center.x);
        line1.setAttribute('y1', p1Center.y);
        line1.setAttribute('x2', childCenter.x);
        line1.setAttribute('y2', childCenter.y);
        connections.appendChild(line1);

        // Line from parent 2 to child
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', p2Center.x);
        line2.setAttribute('y1', p2Center.y);
        line2.setAttribute('x2', childCenter.x);
        line2.setAttribute('y2', childCenter.y);
        connections.appendChild(line2);
    }
}

// Save state to server
async function saveState() {
    const state = {
        animals: animals,
        familyLines: familyLines
    };

    try {
        await fetch('/api/save-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        });
    } catch (error) {
        console.error('Failed to save state:', error);
    }
}

// Load state from server
async function loadState() {
    try {
        const response = await fetch('/api/load-state');
        const state = await response.json();

        if (state.animals && state.animals.length > 0) {
            // Restore animals
            for (const animal of state.animals) {
                addAnimalCard(animal, animal.x, animal.y, animal.generation);
            }
            // Remove duplicates that were just added
            animals = state.animals;

            // Restore family lines
            familyLines = state.familyLines || [];
            updateConnections();
        }
    } catch (error) {
        console.error('Failed to load state:', error);
    }
}

// Loading overlay
function showLoading() {
    loading.classList.remove('hidden');
}

function hideLoading() {
    loading.classList.add('hidden');
}

// Lightbox functions
function openLightbox(imageUrl, name) {
    lightboxImg.src = imageUrl;
    lightboxName.textContent = name;
    lightbox.classList.remove('hidden');
}

function closeLightbox() {
    lightbox.classList.add('hidden');
}

// Start the app
init();
