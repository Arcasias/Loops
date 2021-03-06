const HUNTERS = new Map();

class Hunter extends Entity {

	/**
	 * @constructor
	 */
	constructor(species, options) {
		super(species, Object.assign({}, options, {
			prefix: "H",
		}));

		this._mood = options.mood || 50;
		this._talking = options.talking || false;
		this._text = {
			text: options.text || "",
			width: 0,
			height: 0,
		};
		this._objective = options.objective || null;
		this._exploding = options.exploding || false;
		this._explodingIntensity = options.explodingIntensity || 0;
		this._resetVelocity(true);

		HUNTERS.set(this._id, this);
	}

	/**
	 * @override
	 */
	get species() {
		return super.species;
	}
	set species(species) {
		if (species != this._species && this._objective && SPECIES[species].target != this._objective.species) {
			this._resetVelocity(true);
		}
		super.species = species;
	}

	get mood() {
		let currentMood;
		if (this._mood === 0 && PARAMS.cannibalism) {
			currentMood = "cannibal";
		} else {
			for (const mood of MOODS) {
				if (mood.value <= this._mood) {
					currentMood = mood.name;
				}
			}
		}
		return currentMood;
	}
	set mood(mood) {
		this._mood = Math.max(0, Math.min(100, mood));
	}

	get text() {
		return this._text.text;
	}
	set text(text) {
		this._text = {
			text: text,
			width: PARAMS.c.measureText(text).width,
			height: parseInt(PARAMS.font, 10),
		};
	}

	/**
	 * @override
	 */
	remove() {
		if (this._exploding) {
			clearTimeout(this._exploding);
		}
		super.remove();
		HUNTERS.delete(this._id);
	}

	/**
	 * @override
	 */
	startDragging() {
		super.startDragging();

		this._startTalking("dragged", true);
		this._changeMood(-1);
	}

	/**
	 * @override
	 */
	stopDragging() {
		super.stopDragging();
		this._startTalking("dropped", true);
	}

	/**
	 * @override
	 */
	update() {
		super.update();

		if (window.debugging) {
			this._mood = 100;
		}

		if (this._exploding) {
			this._explodingIntensity++;
			this._x += Math.random() * this._explodingIntensity / 5 - this._explodingIntensity / 10;
			this._y += Math.random() * this._explodingIntensity / 5 - this._explodingIntensity / 10;
		} else if (PARAMS.running && this._speed > 0) {
			if (this._objective) {
				if (this._objective.deleted) {
					this._objectiveLost();
				} else if (this._detectCollision(this._objective)) {
					this._objectiveReached();
				} else {
					this._velocity = {
						x: xFromDistance(this.x, this.y, this._objective.x, this._objective.y) * (this._x < this._objective._x ? 1 : -1),
						y: yFromDistance(this.x, this.y, this._objective.x, this._objective.y) * (this._x < this._objective._x ? 1 : -1),
					};
				}
			} else {
				this._objectiveSearch();
			}
			// 0.1% chance to start talking
			if (!this._talking && Math.random() < 1 / 1000) {
				this._startTalking();
			}
			// If hunter is free to go and can move
			if (!this._dragging && this._moving) {
				let moodMult = this.mood === "cannibal" ? 1.2 : Math.max(1, this._mood) / 50;
				this._x += this._velocity.x * this._speed * moodMult;
				this._y += this._velocity.y * this._speed * moodMult;
			}
		} else if (!this._talking && Math.random() < 1 / 1000) {
			this._startTalking("pending");
		}
	}

	_changeMood(plus = 0) {
		this.mood = this._mood + (plus || (Math.random() > 0.5 ? 1 : - 1));
	}

	/**
	 * @override
	 */
	_draw() {
		super._draw();

		if (this._talking) {
			const color = `rgb(${PARAMS.colorChanging ? PARAMS.color.join(",") : [0, 0, 0].join(",")})`;

			PARAMS.c.strokeStyle = color;
			PARAMS.c.strokeRect(this._x + this.w / 2 - 10, this._y - 35, this._text.width + 20, this._text.height + 20);
			PARAMS.c.fillStyle = "#ffffff";
			PARAMS.c.fillRect(this._x + this.w / 2 - 10, this._y - 35, this._text.width + 20, this._text.height + 20);

			PARAMS.c.fillStyle = color;
			PARAMS.c.fillText(this._text.text, this._x + this.w / 2, this._y - 8);
		}
	}

	_explode() {
		this._startTalking("exploding", true);

		this._exploding = setTimeout(() => {
			let amountOfChildren = HUNTERS.size < HUNTER.maxAmount ? Math.floor(Math.random() * 50) + 1 : 1;
			if (window.debugging) {
				amountOfChildren = 100;
			}
			for (let i = 0; i < amountOfChildren; i++) {
				const newHunter = new Hunter(this._species, {
					x: this.x,
					y: this.y,
					img: this._img,
					size: Math.max(5, this._baseSize + (Math.random() * 5 - 2.5)),
					speed: this._speed,
				});
				HUNTERS.set(newHunter.id, newHunter);
			}
			this._exploding = false;
			this.remove();
		}, 2000);
	}

	_objectiveFound() {
		if (this.mood !== "cannibal") {
			this.mood = this._mood + 5;
		}
	}

	_objectiveLost() {
		this.mood = this._mood - 10;
		this._objective = null;

		this._resetVelocity();
		this._objectiveSearch();

		if (Math.random() < 1 / (100 / 15)) {
			this._startTalking("notfound", true);
		}
	}

	_objectiveReached() {
		this.mood = this._mood + 10;
		this.size += this._objective.nutrition;

		this._objective.remove();

		this._startTalking("found", true);
		this._objectiveSearch();

		if (this._size >= 1) {
			this._explode();
		}
	}

	_objectiveSearch() {
		// Accepted types
		const targets = [...PREYS.values()].filter(prey => prey.species === SPECIES[this._species].target);
		if (this.mood === "cannibal") {
			const otherHunters = [...HUNTERS.values()].filter(hunter => hunter !== this);
			targets.push(...otherHunters);
		}
		if (targets.length === 0) {
			this._objective = null;
		} else {
			let closestEntity;
			let closestDistance = Infinity;
			for (const entity of targets) {
				const distance = Math.sqrt((entity.x - this.x) ** 2 + (entity.y - this.y) ** 2);
				if (distance < closestDistance) {
					closestDistance = distance;
					closestEntity = entity;
				}
			}
			this._objective = closestEntity;
			if (Math.random() < 1 / (100 / 15)) {
				this._startTalking("seek", true);
			}
			return this._objectiveFound();
		}
		// 0.5% chance on each search for mood to decrease
		if (!this._objective && Math.random() < 1 / 200) {
			this._changeMood(-1);
		}
	}

	_startTalking(context = "default", override = false) {
		if (this._talking) {
			if (!override) {
				return;
			}
			this._stopTalking(true);
		}
		Hunter.player.play(SPECIES[this._species].sounds);
		this._toFront();

		this.text = choice(SPECIES[this._species].speech[context]);
		this._talking = setTimeout(() => this._stopTalking(), 2000);
	}

	_stopTalking(clearPrevious = false) {
		if (!this._talking) {
			return;
		}
		if (clearPrevious) {
			clearTimeout(this._talking);
		}
		this._talking = false;
	}
}

Hunter.player = new Player(50, 100);
