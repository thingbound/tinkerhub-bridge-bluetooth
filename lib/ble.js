'use strict';

const { Thing, BatteryLevel, State, Storage } = require('abstract-things');

const SERVICE_BATTERY = '180f';
const C_BATTERY_LEVEL = '2a19';

module.exports = class BLE extends Thing.with(State, Storage) {
	static get type() {
		return 'bluetooth-low-energy';
	}

	static availableAPI(builder) {
		builder.action('bleConnect')
			.description('Connect to this this Bluetooth device')
			.done();

		builder.action('bleDisconnect')
			.description('Disconnect from this Bluetooth device')
			.done();

		builder.action('bleInspect')
			.description('Inspect available Bluetooth Low Energy services')
			.done();

		builder.action('bleRead')
			.done();

		builder.action('bleSubscribe')
			.done();

		builder.action('bleWrite')
			.done();
	}

	constructor(peripheral) {
		super();

		this.metadata.name = peripheral.advertisement.localName || null;
		this.id = 'bluetooth:' + peripheral.id;

		this.peripheral = peripheral;
	}

	async initCallback() {
		await super.initCallback();

		const shouldConnect = await this.storage.get('shouldConnect');

		await this.setShouldConnect(shouldConnect || false);
	}

	setShouldConnect(l) {
		this.updateState('ble:linked', l);

		if(l) {
			return new Promise((resolve, reject) => {
				this.peripheral.connect(err => {
					if(err) {
						this.debug('Could not connect', err);
						reject(new Error('Could not connect; ' + err));
						return;
					}

					this.debug('Connected to peripheral, performing service discovery');

					this.peripheral.discoverAllServicesAndCharacteristics((err) => {
						if(err) {
							this.debug('Could not discover services: ', err);
							reject('Unable to discover services');
							return;
						}

						this.debug('Services discovered');

						this.refresh();
						resolve(true);
					});
				});
			});
		} else {
			this.metadata.removeCapabilities('ble-connected');
			return Promise.resolve();
		}
	}

	async bleConnect() {
		await this.storage.set('shouldConnect', true);

		return this.setShouldConnect(true);
	}

	async bleDisconnect() {
		await this.storage.set('shouldConnect', false);

		this.peripheral.disconnect();

		return true;
	}

	refresh() {

		// Map services and characteristics by UUID
		this.services = {};
		this.characteristics = {};
		for(const service of this.peripheral.services) {
			const characteristics = {};
			if(service.characteristics) {
				for(const c of service.characteristics) {
					this.characteristics[c.uuid] = characteristics[c.uuid] = {
						object: c,
						subscribed: false
					};
				}
			}

			this.services[service.uuid] = {
				object: service,
				characteristics: characteristics
			};
		}

		/*
		 * If this Bluetooth peripheral supports reporting battery, extend
		 * it with the battery level capability and start monitoring the
		 * battery level.
		 */
		if(this.services[SERVICE_BATTERY] && this.characteristics[C_BATTERY_LEVEL]) {
			this.extendWith(BatteryLevel);

			this.on('ble:notify', e => {
				if(e.characteristic === C_BATTERY_LEVEL) {
					this.updateBatteryLevel(e.data[0]);
				}
			});

			this.bleSubscribe(C_BATTERY_LEVEL)
				.then(() => this.bleRead(C_BATTERY_LEVEL))
				.then(data => this.updateBatteryLevel(data[0]));
		}

		this.metadata.addCapabilities('ble-connected');
	}

	destroy() {
		super.destroy();
	}

	bleInspect() {
		const services = {};
		this.peripheral.services.forEach(service => {
			const characteristics = {};
			service.characteristics.forEach(c => {
				characteristics[c.uuid] = {
					name: c.name,
					type: c.type,

					properties: c.properties
				};
			});

			services[service.uuid] = {
				name: service.name,
				type: service.type,
				characteristics: characteristics
			};
		});
		return {
			services: services
		};
	}

	findCharacteristic(id) {
		const c = this.characteristics[id];
		if(! c) throw new Error('Unable to find characteristic ' + id);
		return c;
	}

	bleSubscribe(cId) {
		const c = this.findCharacteristic(cId);
		if(c.subscribed) return;

		c.subscribed = true;
		c.object.on('read', (data, isNotification) => {
			if(! isNotification) return;

			this.emitEvent('ble:notify', {
				service: c.object._serviceUuid,
				characteristic: c.object.uuid,
				data: data
			});
		});

		return new Promise((resolve, reject) => {
			c.object.subscribe(err => {
				if(err) {
					c.subscribed = true;
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	bleRead(cId) {
		const c = this.findCharacteristic(cId);

		return new Promise((resolve, reject) =>
			c.object.read((err, data) => {
				if(err) {
					reject(err);
				} else {
					resolve(data);
				}
			})
		);
	}

	bleWrite(cId, data, opts) {
		const c = this.findCharacteristic(cId);
		opts = opts || {};

		return new Promise((resolve, reject) =>
			c.object.write(data, opts.withoutResponse || false, (err) => {
				if(err) {
					reject(err);
				} else {
					resolve();
				}
			})
		);
	}
};
