
const sparks = 75; // how many sparks per clicksplosion
const bangs = 5; // how many can be launched simultaneously (note that using too many can slow the script down)
const colours = ['#03f', '#f03', '#0e0', '#93f', '#0cf', '#f93', '#f0c'];

let intensity = [];
let Xpos = [];
let Ypos = [];
let dX = [];
let dY = [];
let stars = [];
let decay = [];
let timers = [];
let pageWidth = 800;
let pageHeight = 600;
let scrollHorizontal = scrollVertical = 0;
let count = 0;

function createDiv(char) {
	const div = document.createElement('div');
	div.className = 'explosion'; // Apply the CSS class
	div.textContent = char;
	return div;
}

function bang(N) {
	let A = 0; // count the number of sparks that have decayed or disappeared
	const startIdx = sparks * N;
	const endIdx = startIdx + sparks; // Store the end index

	var verticalWeight = 1.25;

	for (let i = startIdx; i < endIdx; i++) {
		if (decay[i]) {
			Xpos[i] += dX[i];
			Ypos[i] += (dY[i] += verticalWeight / intensity[N]);

			// Use Math.max and Math.min for bounds checking
			Xpos[i] = Math.max(0, Math.min(Xpos[i], pageWidth));
			Ypos[i] = Math.max(0, Math.min(Ypos[i], pageHeight + scrollVertical));

			stars[i].style.left = Xpos[i] + 'px';
			stars[i].style.top = Ypos[i] + 'px';

			// random variation
			if (decay[i] === 15) stars[i].style.fontSize = '10px';
			else if (decay[i] === 7) stars[i].style.fontSize = '2px';
			else if (decay[i] === 1) stars[i].style.visibility = 'hidden';

			decay[i]--;
		} else {
			A++;
		}
	}

	if (A !== sparks) timers[N] = requestAnimationFrame(() => bang(N));
}


function eksplode(e) {
	const x = e.pageX || (e.clientX + document.body.scrollLeft);
	const y = e.pageY || (e.clientY + document.body.scrollTop);
	const N = ++count % bangs;
	const M = Math.floor(Math.random() * 3 * colours.length);

	var lifetime = 66;
	var horizontalMultiplier = 1.25;
	var verticalMultiplier = 1.25;
	var spreadMultiplier = 4;


	intensity[N] = spreadMultiplier + Math.random() * spreadMultiplier;
	for (let i = N * sparks; i < (N + 1) * sparks; i++) {
		Xpos[i] = x;
		Ypos[i] = y - 5;
		dY[i] = (Math.random() - 0.5) * intensity[N] * verticalMultiplier;
		dX[i] = (Math.random() - 0.5) * (intensity[N] - Math.abs(dY[i])) * horizontalMultiplier;
		decay[i] = lifetime + Math.floor(Math.random() * lifetime);

		// create star
		const star = createDiv('*');

		// star color
		if (M < colours.length) {
			star.style.color = colours[i % 2 ? count % colours.length : M];
		} else if (M < 2 * colours.length) {
			star.style.color = colours[count % colours.length];
		} else {
			star.style.color = colours[i % colours.length];
		}

		star.style.fontSize = '13px';
		star.style.visibility = 'visible';
		document.body.appendChild(star);
		stars[i] = star;
	}
	cancelAnimationFrame(timers[N]);
	bang(N);
}

function setWidth() {
	pageWidth = document.documentElement.clientWidth - 7;
	pageHeight = ddocument.documentElement.clientHeight - 7;
}

function setScroll() {
	scrollVertical = document.documentElement.scrollTop;
	scrollHorizontal = document.documentElement.scrollLeft;
}

function initClicksplosion() {
	window.addEventListener('scroll', setScroll);
	window.addEventListener('resize', setWidth);
	document.addEventListener('click', eksplode);
	setWidth();
	setScroll();
	for (let i = 0; i < bangs; i++) {
		for (let j = sparks * i; j < sparks + sparks * i; j++) {
			stars[j] = createDiv('*');
			document.body.appendChild(stars[j]);
		}
	}
}

initClicksplosion();