const MOVE_TYPES = { FOLLOW: 0, FREEROAM: 1, GRAVITY: 2, GOHOME: 3, QUEUE_ONLY: 4};
const MOVE_FOLLOW_TYPES = { NORMAL: 0, CIRCLES: 1, RUNAWAY: 2 };

const CAMERA_FOLLOW_MODES = { CHARACTER: 0, CURSOR: 1, CURSOR_EDGE: 2, DRAG_TO_PAN: 3 };
const DEFAULT_CAMERA_FOLLOW_MODE = CAMERA_FOLLOW_MODES.DRAG_TO_PAN;

const DIRECTION = { N: "N", S: "S", E: "E", W: "W", NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", RIGHT: "E", LEFT: "W" };


const CURSOR = {
	POINTER: 0,
	GRAB: 1,
	GRABBING: 2,
	ARROW_UP: 3,
	ARROW_DOWN: 4,
	ARROW_LEFT: 5,
	ARROW_RIGHT: 6,
	MOVE: 7,
	NO: 8,
};

const DEFAULT_CURSOR = CURSOR.POINTER;

const DEFAULT_STATE = "idle";
const DEFAULT_MODE = MOVE_TYPES.FOLLOW;
const DEFAULT_FOLLOW_MODE = MOVE_FOLLOW_TYPES.NORMAL;
const AUTO_ACTIVATE = true;

const IS_DEBUG = true;



class Utility {


    /********************************************
     * find elements
    ********************************************/
	static findable_elements_selector = 'img, iframe, select, table, textarea, input, h1, h2, h3, h4, h5, h6';
	static ignore_elements_selector = 'body, html, .ignore, .particle, .interactableObject, .interactive-myte, .myte, button, .myteWrapper, .container-wrapper, .container,#controls, .canvas, .canvas > .layer, #inventory';

	static numToReturn = 3; // Number of closest elements to return
	static maxDistance = 200; // Maximum distance to include an element
	static clickable_element_tags = ['textarea', 'input', 'select', 'img']; 	// elements you can click

	static top_only_tags = ['button', 'textarea', 'input', 'select', 'iframe', 'canvas']; // tags they sit on top of

	static isClickableElement(x) {
		if (x.tagName) x = x.tagName;
		if (typeof x === 'string') {
			return this.clickable_element_tags.includes(x.toLowerCase());
		}
		return false;
	}
	
	static preventCache(url) {
		const cacheBuster = `v=${Date.now()}`;
		return `${url}${url.includes('?') ? '&' : '?'}${cacheBuster}`;
	}

	static isTopOnlyTag(x) {
		if (x.tagName) x = x.tagName;

		
		if (typeof x === 'string') {
			console.log(x);
			return this.top_only_tags.includes(x.toLowerCase());
			
		}
		return false;
	}
	
	
	static shouldIgnoreElement(element) {
		return element.matches(this.ignore_elements_selector);
	}
	
	static isNotIgnored(element) {
		while (element) {
			if (element.classList && element.classList.contains('ignore')) {
				return false; // Found an ignored element
			}
			element = element.parentElement; // Move up the DOM tree
		}
		return true; // No ignored element found in the ancestry
	}

    /********************************************
     * find elements - functions
    ********************************************/

    static get_random_element(withinSelector = null) {
        var visibleElements = this.get_filtered_elements(withinSelector);
        return visibleElements[Math.floor(Math.random() * visibleElements.length)];
    }
    static get_findable_elements() {
        return `${this.findable_elements_selector}${this.ignore_elements_selector.split(',')}`;
    }

	static get_filtered_elements(withinSelector = null) {
		// Retrieve the elements
		const elements = withinSelector 
			? withinSelector.querySelectorAll(this.get_findable_elements()) 
			: document.querySelectorAll(this.get_findable_elements());
	
		// Convert NodeList to array for filtering
		const elementsArray = Array.from(elements);
	
		// Filter elements based on visibility and ignore selectors
		const visibleElements = elementsArray.filter(element => {
			// Check if the element is visible
			const isVisible = element.offsetParent !== null;
	
			// Check if the element matches any ignore selectors
			const isIgnored = this.ignore_elements_selector.split(',').map(selector => selector.trim()).some(ignoreSelector => {
				return element.matches(ignoreSelector);
			});
	
			// Return element if it is visible and does not match ignore selectors
			return isVisible && !isIgnored;
		});
	
		return visibleElements;
	}

    // Define a to find the closest elements to a mouse click event
	static findClosestElementToMouse(mousePosX, mousePosY, withinSelector = null, numToReturn = this.numToReturn, maxDistance = this.maxDistance, chooseRandom = false) {
        // Create an array to store elements with their distances
        const elementsWithinDistance = [];
        const fromCenter = false;
        var visibleElements = this.get_filtered_elements(withinSelector);


        // Calculate the distance between the mouse click and each element
        visibleElements.forEach((element) => {
            const elementRect = Utility.get_bounding_box_with_scroll(element);
            var elementX, elementY;

            if (fromCenter) {
                elementX = elementRect.left + elementRect.width / 2;
                elementY = elementRect.top + elementRect.height / 2;
            } else {
                const elementLeft = elementRect.left;
                const elementRight = elementLeft + elementRect.width;
                const elementTop = elementRect.top;
                const elementBottom = elementTop + elementRect.height;

                // calculate the closest x and y
                elementX = Math.max(elementLeft, Math.min(mousePosX, elementRight));
                elementY = Math.max(elementTop, Math.min(mousePosY, elementBottom));
            }

            var distance = Utility.calculateDistance(mousePosX, mousePosY, elementX, elementY);

            if (distance <= maxDistance) {
                elementsWithinDistance.push({ element, distance });
            }
        });



        // Sort the elements by proximity (ascending order)
        elementsWithinDistance.sort((a, b) => a.distance - b.distance);

        // Extract and return the specified number of closest elements
        const closestElements = elementsWithinDistance.slice(0, numToReturn).map((item) => item.element);

        // choose random
        if (chooseRandom) return closestElements[Math.floor(Math.random() * closestElements.length)];

        return closestElements;
    }



    static getNextKey(current, all){
        let ALL_KEYS = Object.keys(all);
        return (current + 1) % ALL_KEYS.length;
    }

	static isCollision(rect1, rect2) {
		return !(rect1.right < rect2.left ||
			rect1.left > rect2.right ||
			rect1.bottom < rect2.top ||
			rect1.top > rect2.bottom);
	}

	static isIntersecting(x, y, rect) {
		return x >= rect.left &&
			   x <= rect.right &&
			   y >= rect.top &&
			   y <= rect.bottom;
	}

	static isDescendant(child, parent) {
		if (!(child instanceof HTMLElement) || !(parent instanceof HTMLElement)) {
			return false;
		}

		var node = child.parentNode;
		while (node !== null) {
			if (node === parent) {
				return true;
			}
			node = node.parentNode;
		}
		return false;
	}

	static lerp(start, end, t) {
		return start * (1 - t) + end * t;
	}

	static random_int(min, max) { // min and max included 
		return Math.floor(Math.random() * (max - min + 1) + min)
	}

	static log(txt) {
		if (IS_DEBUG) console.log(txt);
	}

	// Define a to calculate the distance between two points
	static calculateDistance(x1, y1, x2, y2) {
		const dx = x1 - x2;
		const dy = y1 - y2;
		return Math.sqrt(dx * dx + dy * dy);
	}

	static isMobileDevice() {
		return /Android|iPhone|iPod|Windows Phone|Mobile|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent) || window.innerWidth <= 768;
	}

	static hasTouchOnlySupport() {
		// Check if there are no gamepad devices currently connected
		const gamepads = navigator.getGamepads();
		for (let i = 0; i < gamepads.length; i++) {
			if (gamepads[i]) {
				return false; // There's at least one connected input device
			}
		}

		// If no gamepad devices are connected, it's likely a touch-only device
		return true;
	}

	static checkCollide(element1, element2) {
		return element1.left <= element2.right &&
			element1.right >= element2.left &&
			element1.top <= element2.bottom &&
			element1.bottom >= element2.top;
	}

	static is_coord_touching_element(posX, posY, element) {
		return posX >= element.left &&
			posX <= element.right &&
			posY >= element.top &&
			posY <= element.bottom;
	}

	static is_element_above_viewport(element) {
		const elementRect = element.getBoundingClientRect();
		return elementRect.bottom < 0;
	}

	static is_element_below_viewport(element) {
		const elementRect = element.getBoundingClientRect();
		return elementRect.top > window.innerHeight;
	}

	static get_bounding_box_with_scroll(x) {
		var c = x.getBoundingClientRect();

		return {
			top: c.top + document.body.scrollTop,
			left: c.left + document.body.scrollLeft,
			width: c.width,
			height: c.height,
			right: c.left + c.width + document.body.scrollLeft,
			bottom: c.top + c.height + document.body.scrollTop
		};
	}

	static clamp(current, min, max) {
		return Math.max(min, Math.min(max, current));
	}

	static get_key_by_value(object, value) {
		for (const key in object) {
			if (object[key] === value) {
				return key;
			}
		}
		return null; // Return null if the value is not found
	}

	static findLargestChildDimensions(parentElement) {
		const children = parentElement?.children || [];
		const dimensions = Array.from(children).map(child => child.getBoundingClientRect());

		const maxWidth = Math.max(...dimensions.map(rect => rect.width), 0);
		const maxHeight = Math.max(...dimensions.map(rect => rect.height), 0);

		return { width: maxWidth, height: maxHeight };
	}

	static getScrollbarDimensions() {

		// Creating invisible container
		const outer = document.createElement('div');
		outer.style.visibility = 'hidden';
		outer.style.overflow = 'scroll'; // forcing scrollbar to appear
		outer.style.msOverflowStyle = 'scrollbar'; // needed for WinJS apps
		document.body.appendChild(outer);

		// Creating inner element and placing it in the container
		const inner = document.createElement('div');
		outer.appendChild(inner);

		// Calculating difference between container's full width and the child width
		const scrollbarXHeight = (outer.offsetWidth - inner.offsetWidth);
		const scrollbarYWidth = (outer.offsetHeight - inner.offsetHeight);

		// Removing temporary elements from the DOM
		outer.parentNode.removeChild(outer);

		return {
			x: scrollbarXHeight,
			y: scrollbarYWidth
		};
	}

	// Function to get the XPath of an element
	static getElementXPath(element) {
		if (element.id) {
			return `//*[@id="${element.id}"]`;
		}

		if (element === document) {
			return '';
		}

		if (element === document.body) {
			return '/html/body';
		}

		let ix = 0;
		let siblings = element.parentNode ? element.parentNode.childNodes : [];
		for (let i = 0; i < siblings.length; i++) {
			let sibling = siblings[i];
			if (sibling === element) {
				let tagName = element.tagName.toLowerCase();
				let nth = ix + 1;
				return getElementXPath(element.parentNode) + '/' + tagName + `[${nth}]`;
			}
			if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
				ix++;
			}
		}
	}

	// Function to get an element by XPath
	static getElementByXPath(xpath) {
		let result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
		return result.singleNodeValue;
	}

	// Event listener to log XPath of clicked element
	static initXPathClick() {
		document.addEventListener('click', function (event) {
			try {
				let element = event.target;
				let xpath = getElementXPath(element);
				console.log(xpath);
				// Optionally retrieve the element by XPath and log it
				// let retrievedElement = getElementByXPath(xpath);
				// console.log(retrievedElement);
			} catch (error) {
				console.error('An error occurred:', error);
			}
		});

	}


}