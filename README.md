# tinkerhub-bridge-bluetooth

This module provides access to Bluetooth devices and peripherals in a [Tinkerhub](https://github.com/tinkerhub/tinkerhub) network. These devices can then be
extended by other plugins to provide device specific functionality.

* **Latest version**: 0.2.0
* **Status**: Unstable, currently advertisements seem to stop after a while and no devices can be found.

## Installation and use

This module uses a [Noble](https://github.com/sandeepmistry/noble) which has
some [prerequisites](https://github.com/sandeepmistry/noble#prerequisites)
depending on your platform.

When running [tinkerhubd](https://github.com/tinkerhub/tinkerhub-daemon) install
via:

```
$ tinkerhubd install bridge-bluetooth
```

### Running on Linux

To make things run smoothly on Linux you should use `setcap` to allow Node
to start and stop scanning.

```
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

`setcap` is needed, which is usually available in the package `libcap2-bin`.

### Connecting to a device

The command `bleConnect` will mark a device for connection and allow other
plugins to interact with it:

```
$ tinkerhub
> bluetooth:ccb11ab6a729 bleConnect
```

## Extending devices

To extend a Bluetooth device it is recommended to look for both the type
and the capability `ble-connected` which indicates that a device is connected.

```javascript
th.get('type:bluetooth-low-energy', 'cap:ble-connected')
  .extendWith(thing => thing.bleInspect()
    .then(data => {
      const services = data.services;
      if(! services[NEEDED_SERVICE]) return;

      return new CustomDevice(thing).init();
    })
  );
```

The following actions are available for use:

* `bleConnect`

  Connect to a device and mark it for automatic connection. Used to initialize
  connections.

* `bleDisconnect`

  Disconnect from a device and stop connecting to it automatically.

* `bleInspect: object`

  Inspect the services and characteristics that the device supports.

* `bleRead(charateristic): mixed`

  Read data from the given characteristic.

* `bleWrite(characteristic, mixed, options={})`

  Write some data to the specified characteristic. The only option available
  is `withoutResponse` that when set to to true will do a write without waiting
  for the device to acknowledge it.

* `bleSubscribe(characteristic)`

  Subscribe to the characteristic to be notified when the device changes the
  value of the characteristic.

The following events are available:

* `ble:notify`

  Emitted when a subscribed characteristic changes. Is given an object with
  three keys: `service`, `characteristic` and `data`.
