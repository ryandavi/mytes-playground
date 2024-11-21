class MapObject {
	constructor(type, posX, posY, width = 64, height = 64) {
		this.type = type;
		this.size = { width, height };
		this.position = { x: posX, y: posY };
		this.element;
		this.active = true;
	}

	intersects(other) {
		return this.position.x < other.position.x + other.size.width &&
			this.position.x + this.size.width > other.position.x &&
			this.position.y < other.position.y + other.size.height &&
			this.position.y + this.size.height > other.position.y;
	}

	press(parent){
		console.log(this.type, ' pressed');
		if(parent.activeMyte && this.active){
			this.select();
			parent.activeMyte.queue.addMoveToElement(this.element, 300, this);
			return true;
		}
	}

	select(){
		this.element.classList.add('selected-object');
	}

	unselect(){
		this.element.classList.remove('selected-object');
	}

	hover(){
		return true;
	}

	interact(){
		return true;
	}

	remove(){
		this.element.remove();
		this.active = false;
	}


	render(container, parent) {
		const divElement = document.createElement('div');
		divElement.classList.add('mapObject');
		divElement.classList.add(this.type);

		let interactElement = document.createElement('div');
		interactElement.classList.add('interact');

		// add click event
		interactElement.addEventListener('click', () => {
			this.press(parent);
		});

		divElement.appendChild(interactElement);

		Object.assign(divElement.style, {
			left: `${this.position.x}px`,
			top: `${this.position.y}px`,
			width: `${this.size.width}px`,
			height: `${this.size.height}px`
		});


		
		if(this.type.includes('grass')){
			['back', 'front'].forEach(part => {
				const div = document.createElement('div');
				div.classList.add(part);
				div.style.backgroundImage = `url('images/MapObjects/${this.type}_${part}.png')`;
				div.style.backgroundSize = 'cover'; // Or adjust based on your design
				div.style.zIndex = part === 'front' ? '1' : '0';
		
				// animation delay
				if (part == 'front') {
					const randomDelay = Math.random() * 5; // Random delay between 0 and 5 seconds
					div.style.animationDelay = `${randomDelay}s`;
					div.style.zIndex = parent.getZIndex(this.position.y, this.size.height);
				}
				divElement.appendChild(div);
			});
		}else{
			// item dragged in
			const img = document.createElement('div');
			img.style.zIndex = parent.getZIndex(this.position.y, this.size.height);
			img.classList.add('item', this.type);
			divElement.appendChild(img);
		}

		this.element = divElement;

		container.appendChild(divElement);
		return divElement;
	}
}

class MapItem extends MapObject {

	constructor(type, posX, posY, width = 64, height = 64) {
		super(type, posX, posY, width, height);
	}


}

class PlantObject extends MapObject {

	constructor(type, posX, posY, width = 64, height = 64) {
		super(type, posX, posY, width, height);
	}

}

class MapObjects {
	constructor(parent) {
		this.objects = [];
		this.parent = parent;
		this.objectLayerSelector = '.layer.foreground';
	}

	addRandomMapObjects(count) {
		const objectTypes = ["grass_1", "grass_2", "grass_3"];
		const foregroundLayer = this.parent.canvas.querySelector('.layer.foreground');

		if (!foregroundLayer) return;

		const maxX = foregroundLayer.clientWidth;
		const maxY = foregroundLayer.clientHeight;

		// Add objects
		for (let i = 0; i < count; i++) {
			let newObject;
			const randomObject = objectTypes[Math.floor(Math.random() * objectTypes.length)];
			const randomX = Math.floor(Math.random() * maxX);
			const randomY = Math.floor(Math.random() * maxY);

			newObject = new PlantObject(randomObject, randomX, randomY, 64, 64);

			this.objects.push(newObject);
		}
	}

	init() {
		this.addRandomMapObjects(150);

		// run if we have a foreground
		const foregroundLayer = this.parent.canvas.querySelector(this.objectLayerSelector);
		if (!foregroundLayer) return;

		const fragment = document.createDocumentFragment();
		// render all objects
		this.objects.forEach(mapObject => {
			const element = mapObject.render(fragment, this.parent);
		});

		foregroundLayer.appendChild(fragment);
	}



}