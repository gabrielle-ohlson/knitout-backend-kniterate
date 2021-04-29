"use strict";

const fs = require('fs');

let Carrier = "5";
let wastePasses = 71; //odd so end with pos pass, complying with tuck caston direction
let StartRows = 10;
let EndRows = 10;

let YarnInStitchNumber = 5; // let YarnInStitchNumber = 67;
let CastOnStitchNumber = 5; // let CastOnStitchNumber = 67;
let PlainStitchNumber  = 6; // let PlainStitchNumber  = 68;

let YarnInRoller = 150;
let MainRoller = 400;

let SpeedNumber = 300;

let OutFile = "";
//figure out output filename based on input js name / other arguments:
if (process.argv.length >= 2) {
	if (process.argv[1].endsWith(".js")) {
		OutFile = process.argv[1].substr(0, process.argv[1].length - 3) + ".k";
	}
	for (let i = 2; i < process.argv.length; ++i) {
		if (process.argv[i].startsWith("out:")) {
			OutFile = process.argv[i].substr(4);
		}
	}
}

if (OutFile === "") {
	console.log("NOTE: will not write output file.");
} else {
	console.log("Will write output to '" + OutFile + "'");
}

function parseBedNeedle(bn) {
	if (typeof(bn) !== "string") throw new Error("parseBedNeedle must be called with a string");
	let m = bn.match(/^([fb]s?)([-+]?\d+)$/);
	if (m === null) throw new Error("string '" + bn + "' does not look like a needle");
	return {
		bed:m[1],
		needle:parseInt(m[2])
	};
}

function bnToHalf(bn_str) {
	let bn = parseBedNeedle(bn_str);
	if      (bn.bed === 'f')  return 'f' + (2*bn.needle);
	else if (bn.bed === 'fs') return 'f' + (2*bn.needle+1);
	else if (bn.bed === 'b')  return 'b' + (2*bn.needle+1);
	else if (bn.bed === 'bs') return 'b' + (2*bn.needle);
	else throw "don't know how to half-guage the needle '" + bn_str + "'";
}

function Helpers() {
	this.knitout = [];
	this.inYarns = {};
	this.yarnUsedCount = {};
	this.racking = 0;
	this.needIn = true; //TODO: bring in carrier in a nice way when resuming another tube
	this.out(";!knitout-2");
	this.out(";;Carriers: 1 2 3 4 5 6");
}

Helpers.prototype.out = function out(str) {
	//console.log("OUT: " + str);
	this.knitout.push(str);
};

Helpers.prototype.write = function write() {
	if (OutFile !== "") {
		fs.writeFileSync(OutFile, this.knitout.join("\n") + "\n");
	}
};

Helpers.prototype.start_tube = function start_tube(dir, bns) {
	let front = [];
	let back = [];
	bns.forEach(function(bn_str){
		let bn = parseBedNeedle(bn_str);
		if (bn.bed === 'f') {
			front.push(bn.needle);
		} else if (bn.bed === 'b') {
			back.push(bn.needle);
		} else {
			console.assert("start_tube should only be called with 'f' or 'b' needles.");
		}
	});
	// not lexicographic, numeric sort please!
	front.sort(function(a,b){return a-b;});
	back.sort(function(a,b){return a-b;});

	console.assert(front.length !== 0 && back.length !== 0, "should start a tube with at least a stitch on each bed.");

	//do a tuck pattern to anchor yarn:
	// v   v   v <--
	//   v   v   -->
	// ^------ first needle to be knit is here (left -> right on kniterate)
	let n = Math.min(front[0], back[0]);
	let max = Math.max(front[front.length - 1], back[back.length - 1]);
	let startWidth = max - n + 1;
	let wasteNmin, wasteNmax;
	
	//--- add waste yarn section, making sure it uses at least 20 needles (& dropping extras if caston < 20) ---
	if (startWidth < 20) {
		n >= (20 - startWidth) ? ((wasteNmin = n - (20 - startWidth)), (wasteNmax = max)) : ((wasteNmin = n), (wasteNmax = max + (20-startWidth)));
	} else {
		wasteNmin = n;
		wasteNmax = max;
	}

	let toDrop = [];
	let me = this;
	function initTuck(d, bn) {
		me.tuck(d, bn);
		toDrop.push(bn);
	}
	this.out(`x-speed-number ${SpeedNumber}`);
	this.out("x-stitch-number " + YarnInStitchNumber);
	this.out(`x-roller-advance ${YarnInRoller}`);
	if(!this.inYarns[Carrier]){
		this.out("in " + Carrier);
		this.inYarns[Carrier] = true;
		this.yarnUsedCount[Carrier] = 0;

		console.log("Bringing Carrier " + Carrier.toString() + " in.");

	} else {
		console.warn("Bringing in carrier that was already in " + Carrier.toString());
	}

	for (let i = wasteNmin; i <= wasteNmax; ++i) {
		initTuck('+', 'f' + i);
	}
	for (let i = wasteNmax; i >= wasteNmin; --i) {
		this.tuck('-', 'f' + i);
	}

	//add waste yarn section
	this.out("x-stitch-number " + PlainStitchNumber);
	for (let p = 0; p < wastePasses; ++p) {
		if (p % 2 === 0) {
			for (let i = wasteNmin; i <= wasteNmax; ++i) {
				if (i % 2 === 0) {
					this.knit('+', `f${i}`);
					if (p === 0) toDrop.push(`f${i}`);
				} else {
					this.knit('+', `b${i}`);
					if (p === 0) toDrop.push(`b${i}`);
				}
			}
		} else {
			for (let i = wasteNmax; i >= wasteNmin; --i) {
				if (i % 2 === 0) {
					this.knit('-', `b${i}`);
					if (p === 1) toDrop.push(`b${i}`);
				} else {
					this.knit('-', `f${i}`);
					if (p === 1) toDrop.push(`f${i}`);
				}
			}
		}
	}

	//make list of needles and directions in tube order:
	let sts = [];
	if (dir === 'clockwise') {
		for (let i = front.length-1; i >= 0; --i) {
			sts.push(['-', 'f' + front[i]]);
		}
		for (let i = 0; i < back.length; ++i) {
			sts.push(['+', 'b' + back[i]]);
		}
	} else { console.assert(dir === 'anticlockwise');
		for (let i = back.length-1; i >= 0; --i) {
			sts.push(['-', 'b' + back[i]]);
		}
		for (let i = 0; i < front.length; ++i) {
			sts.push(['+', 'f' + front[i]]);
		}
	}

	//alternating tuck cast on:
	this.out("x-stitch-number " + CastOnStitchNumber);
	sts.forEach(function(dbn, i) {
		if (i%2 == 0) this.knit(dbn[0], dbn[1]);
	}, this);
	sts.forEach(function(dbn, i) {
		if (i%2 == 1) this.knit(dbn[0], dbn[1]);
	}, this);

	//drop everything in 'toDrop' that wasn't part of alternating tucks:
	toDrop.forEach(function(bn){
		//WARNING: this might actually drop **TOO MUCH** if the tucked needles overlap other existing stitches
		let idx = bns.indexOf(bn);
		if (idx === -1) {
			this.drop(bn);
		}
	}, this);

	//knit some plain rows: //TODO: add a draw thread?
	// this.out("x-stitch-number " + PlainStitchNumber);
	this.out(`x-roller-advance ${MainRoller}`); //TODO: determine where this should go
	for (let row = 0; row < StartRows; ++row) {
		sts.forEach(function(dbn, i) {
			this.knit(dbn[0], dbn[1]);
		}, this);
	}

	let first = 0;
	while (first < sts.length && sts[first][1] !== bns[0]) ++first;
	console.assert(first < sts.length, "First stitch from 'bns' should exist in 'sts'.");

	//knit a bit extra to get aligned to the input bns:
	for (let i = 0; i < first; ++i) {
		let st = sts.shift();
		this.knit(st[0], st[1]);
		sts.push(st);
	}

	//alternating stitches to separate starting tube from knitting:
	this.out("x-stitch-number " + CastOnStitchNumber);
	sts.forEach(function(dbn, i) {
		if (i%2 == 0) this.knit(dbn[0], dbn[1]);
	}, this);
	sts.forEach(function(dbn, i) {
		if (i%2 == 1) this.knit(dbn[0], dbn[1]);
	}, this);

	this.out("x-stitch-number " + PlainStitchNumber);

};
Helpers.prototype.bringIn = function bringIn(Carrier) {
	console.warn("Bringing in Carrier " + Carrier.toString() + " before use.");
	this.out("in " + Carrier);
	this.inYarns[Carrier] = true;
	this.yarnUsedCount[Carrier] = 0;
};
Helpers.prototype.knit = function knit(d, bn) {
	if(!this.inYarns[Carrier]){
		console.warn("Using carrier before in : " + Carrier.toString());
		this.bringIn(Carrier);
	}
		
	this.yarnUsedCount[Carrier] += 1;
	this.out("knit " + d + " " + bnToHalf(bn) + " " + Carrier);
};

Helpers.prototype.drop = function drop(bn) {
	this.out("drop " + bnToHalf(bn));
};

Helpers.prototype.tuck = function tuck(d, bn) {
	if(!this.inYarns[Carrier]){
		console.warn("Using carrier before in : " + Carrier.toString());
		this.bringIn(Carrier);
	}

	this.yarnUsedCount[Carrier] += 1;
	this.out("tuck " + d + " " + bnToHalf(bn) + " " + Carrier);
};

Helpers.prototype.miss = function miss(d, bn) {
	if(!this.inYarns[Carrier]){
		console.warn("Using carrier before in : " + Carrier.toString());
		this.bringIn(Carrier);
	}

	this.out("miss " + d + " " + bnToHalf(bn) + " " + Carrier);
};

Helpers.prototype.decrease = function decrease(d, bn) {
	this.out(';decrease'); //remove
	this.knit(d, bn);
};

Helpers.prototype.increase = function increase(d0, bn0, d1, bn1) {
	this.out(';increase'); //remove
	this.knit(d0, bn0);
	this.miss(d0, bn1); //?
	// this.tuck(d1 == '+' ? '-' : '+', bn1); 
	this.knit(d0 == '+' ? '-' : '+', bn1); //bug fix ^
};

Helpers.prototype.end_tube = function end_tube(dir, bns) {

	//d(bn) returns direction to knit on 'bn' given overall tube direction
	function d(bn_str) {
		let bn = parseBedNeedle(bn_str);
		if (bn.bed[0] === 'f') {
			if (dir === 'clockwise') {
				return '-';
			} else { console.assert(dir === 'anticlockwise', "dir is always clockwise or anticlockwise");
				return '+';
			}
		} else { console.assert(bn.bed[0] === 'b', "bed is always f* or b*");
			if (dir === 'clockwise') {
				return '+';
			} else { console.assert(dir === 'anticlockwise', "dir is always clockwise or anticlockwise");
				return '-';
			}
		}
	}

	//alternating stitches to separate ending tube from knitting:
	this.out("x-stitch-number " + CastOnStitchNumber);
	bns.forEach(function(bn, i) {
		if (i%2 == 0) this.knit(d(bn), bn);
	}, this);
	bns.forEach(function(bn, i) {
		if (i%2 == 1) this.knit(d(bn), bn);
	}, this);

	this.out("x-stitch-number " + PlainStitchNumber);
	for (let row = 0; row < EndRows; ++row) {
		bns.forEach(function(bn, i) {
			this.knit(d(bn), bn);
		}, this);
	}
	if(this.inYarns[Carrier]){
		this.out("out " + Carrier);
		this.inYarns[Carrier] = false;
		this.yarnUsedCount[Carrier] = 0;
		console.log("Taking Carrier " + Carrier.toString() + " out.");
	} else {
		console.warn("Taking out carrier that was never in : " + Carrier.toString());
	}
	bns.forEach(function(bn, i) {
		this.drop(bn);
	}, this);
};

Helpers.prototype.xfer = function xfer(from, to) {
	this.out("xfer " + bnToHalf(from) + " " + bnToHalf(to));
};

Helpers.prototype.setRacking = function setRacking(from_str, to_str) {
	let target;
	if (arguments.length === 0) {
		target = 0;
	} else {
		let from = parseBedNeedle(bnToHalf(from_str));
		let to = parseBedNeedle(bnToHalf(to_str));
		if (from.bed === 'f' && to.bed === 'b') {
			target = from.needle - to.needle;
		} else { console.assert(from.bed === 'b' && to.bed === 'f');
			target = to.needle - from.needle;
		}
		console.assert(Math.abs(target) <= 8, "Racking out of limits?"+from_str+" "+to_str);
	}
	if (this.racking !== target) {
		this.racking = target;
		this.out("rack " + this.racking);
	}
};

Helpers.prototype.xfer_cycle = function xfer_cycle(opts, from, to, xfers) {
	xfers.forEach(function(xf){
		this.setRacking(xf[0], xf[1]);
		this.xfer(xf[0], xf[1]);
	}, this);
};

Helpers.prototype.stash = function stash(from, to) {
	if (from.length !== to.length) throw new Error("from and to arrays should be the same length");
	if (from.length === 0) return;

	this.setRacking(from[0], to[0]);

	for (let i = 0; i < from.length; ++i) {
		this.xfer(from[i], to[i]);
	}

	this.setRacking();
};

Helpers.prototype.unstash = function unstash(from, to) {
	if (from.length !== to.length) throw new Error("from and to arrays should be the same length");
	if (from.length === 0) return;

	this.setRacking(from[0], to[0]);

	for (let i = 0; i < from.length; ++i) {
		this.xfer(from[i], to[i]);
	}

	this.setRacking();
};


module.exports = {Helpers:Helpers};