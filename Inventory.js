class Inventory {
	constructor(parent, inventoryElement) {
		this.parent = parent;
		this.inventoryElement = inventoryElement;
		this.items = [];

		// so its exactly where you place it
        this.offsetX = 0;
        this.offsetY = 0;

		this.addDragAndDropEvents();
	}

	loadItems(itemsArray) {
		this.items = itemsArray.map(itemData => {
			const { name, quantity, type } = itemData;
			
			const itemElement = document.createElement('div');
			itemElement.className = `item ${type}`;
			itemElement.dataset.name = name;
			itemElement.dataset.quantity = quantity;
			itemElement.draggable = true;

			this.inventoryElement.appendChild(itemElement);

			return { name, quantity, type, element: itemElement };
		});
	}

	addItem(name, quantity, type) {
		let existingItem = this.items.find(item => item.name === name);

		if (existingItem) {
			existingItem.quantity += quantity;
			existingItem.element.dataset.quantity = existingItem.quantity;
		} else {
			const itemElement = document.createElement('div');
			itemElement.className = `item ${type}`;
			itemElement.dataset.name = name;
			itemElement.dataset.quantity = quantity;
			itemElement.draggable = true;

			this.inventoryElement.appendChild(itemElement);
			this.items.push({ name, quantity, type, element: itemElement });
		}
	}

	addDragAndDropEvents() {
		const containers = document.querySelectorAll('.container');
		let draggedItem = null;

		this.inventoryElement.addEventListener('dragstart', e => {
			if (e.target.classList.contains('item')) {
				draggedItem = e.target;
				containers.forEach(container => container.classList.add('valid-drop-target'));

				const rect = e.target.getBoundingClientRect();
				this.offsetX = e.clientX - rect.left;
				this.offsetY = e.clientY - rect.top;


			}
		});

		this.inventoryElement.addEventListener('dragend', () => {
			containers.forEach(container => {
				container.classList.remove('valid-drop-target', 'on-target');
			});
			draggedItem = null;
		});

		containers.forEach(container => {
			container.addEventListener('dragover', e => {
				e.preventDefault();
				container.classList.add('on-target');
			});

			container.addEventListener('dragleave', () => {
				container.classList.remove('on-target');
			});

			container.addEventListener('drop', e => {
				e.preventDefault();
				if (draggedItem) {


					// add to canvas
					const layerForeground = container.querySelector('.layer.foreground');
					if (layerForeground) {

						const name = draggedItem.dataset.name;
						const quantity = parseInt(draggedItem.dataset.quantity);
						const type = draggedItem.classList[2];
	
						let mouse = this.parent.getLocalMouse();
	
						const mapObject = new MapItem(type, mouse.x - this.offsetX, mouse.y - this.offsetY, 64, 64);
						this.parent.mapObjects.objects.push(mapObject);

						mapObject.render(layerForeground, this.parent);
					
						// update inventory quantity
						if (quantity > 1) {
							draggedItem.dataset.quantity = quantity - 1;
						} else {
							this.inventoryElement.removeChild(draggedItem);
							this.items = this.items.filter(item => item.name !== name);
						}
					}
				}
			});
		});
	}
}
