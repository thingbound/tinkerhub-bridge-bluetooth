'use strict';

const debug = require('debug')('th:bluetooth');

const th = require('tinkerhub');

const noble = require('noble');

const { ExpiringDiscovery, addService, removeService, refService, unrefService } = require('tinkerhub-discovery');

const BLE = require('./lib/ble');

if(! module.parent) {
	process.on('warning', e => console.warn(e.stack));
	process.on('error', e => console.error(e.stack));
}

/*
setInterval(() => {
	if(noble.state === 'poweredOn') {
		noble.startScanning([], true);
	}
}, 60000);
*/

const hasSeen = Symbol('hasSeen');


class NobleDiscovery extends ExpiringDiscovery {
	static get type() {
		return 'bluetooth';
	}

	constructor() {
		super({
			maxStaleTime: 60 * 1000
		});
	}

	start() {
		super.start();

		const startScan = () => {
			noble.startScanning([], true);

			if(! this.scanner) {
				this.scanner = setInterval(() => {
					noble.startScanning([], true);
				}, 60000);
				setInterval(() => noble.stopScanning(), 5 * 60000);
			}
		};

		/*
		 * Listen for state changes and start scanning when ready.
		 */
		noble.on('stateChange', state => {
			debug('State is now', state);
			if(state === 'poweredOn') {
				startScan();
			} else {
				noble.stopScanning();
			}
		});

		noble.on('scanStart', () => {
			debug('Scanning started');
		});

		/*
		 * Scanning is restarted whenever it stops.
		 */
		noble.on('scanStop', () => {
			debug('Scanning stopped');
		});

		noble.on('discover', peripheral => {
			if(! peripheral[hasSeen]) {
				peripheral.on('connect', () => {
					this[refService](peripheral);
				});

				peripheral.on('disconnect', () => {
					debug('Disconnected from ' + peripheral.id);

					this[unrefService](peripheral);

					setTimeout(() => peripheral.connect(), 10000);
				});

				peripheral[hasSeen] = true;
			}

			this[addService](peripheral);
		});

		/*
		 * Start scanning if powered on.
		 */
		if(noble.state === 'poweredOn') {
			startScan();
		}
	}

	stop() {
		super.stop();

		// TODO: Remove all listeners that have been added to `noble`
	}
}

const discovery = new NobleDiscovery()
	.map(p => new BLE(p).init());

th.registerDiscovery(discovery);
