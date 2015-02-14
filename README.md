tr-064
======

TR-064 - UPnP/IGD for node.js

## Description

A library to interact with routers and other network devices.
Tested and designd for Fritz.Box routers.

This library is capable of:
* Supports the UPnP and IGD Protocol
* Read and configure Services
* Subscribe to Events with included EventServer

More info about TR-064: http://avm.de/fileadmin/user_upload/Global/Service/Schnittstellen/AVM_TR-064_first_steps.pdf

## Install

<pre>
  npm install tr-064
</pre>

## It`s simple

Connect to the device and read a Service.

```javascript
var tr = require("tr-064");
var tr064 = new tr.TR064();
tr064.initTR064Device("fritz.box", 49000, function (err, device) {
    if (!err) {
       var wanip = device.services["urn:dslforum-org:service:WANIPConnection:1"];
       wanip.actions.GetInfo(function(err, result){
       		console.log(result);
       });
    }
});

```

## List All Services and Variables

Get the info from both protocols.

```javascript
var tr = require("tr-064");
var tr064 = new tr.TR064();
tr064.initTR064Device("fritz.box", 49000, function (err, device) {
    if (!err) {
        console.log("Found device! - TR-064");
        showDevice(device);
    }
});

tr064.initIGDDevice("fritz.box", 49000, function (err, device) {
    if (!err) {
        console.log("Found device! - IGD");
        showDevice(device);
    }
});

var showDevice = function (device) {
    console.log("=== " + device.meta.friendlyName + " ===");
    device.meta.servicesInfo.forEach(function (serviceType) {
        var service = device.services[serviceType];
        console.log("  ---> " + service.meta.serviceType + " <---");
        service.meta.actionsInfo.forEach(function (action) {
            console.log("   # " + action.name + "()");
            action.inArgs.forEach(function (arg) {
                console.log("     IN : " + arg);
            });
            action.outArgs.forEach(function (arg) {
                console.log("     OUT: " + arg);
            });
        });
    });
}
```


## Samples

### Get FritzBox CallList
```javascript
tr064.initTR064Device("fritz.box", 49000, function (err, device) {
	if (!err) {	
		var service = device.services["urn:dslforum-org:service:X_AVM-DE_OnTel:1"];
		service.actions.GetCallList(function(err, result){
			if(err) { console.log(err); return; }
			console.log("Got URL: " + result.NewCallListURL);			
		});
	} else {
		console.log("error - TR064: " + err);
	}
}, {user: "username", password:"password"});
```
Tested with FritzBox 7390 on Fritz!Os 06.03 and a user account with phone/dial rights. 
The result is an URL to get the call list as XML file.


### Get Connection Details
```javascript
tr064.initTR064Device("fritz.box", 49000, function (err, device) {
	if (!err) {	
		var service = device.services["urn:dslforum-org:service:WANCommonInterfaceConfig:1"];
		service.actions.GetCommonLinkProperties(function(err, result) {
			if(err) {console.log(err); console.log(result); return;}
			console.log(result);
		});
	} else {
		console.log("error - TR064: " + err);
	}
}, {user: "username", password:"password"});
```
Tested with FritzBox 7170 with firmware 29.04.88 using username "admin" and webinterface password.


## Methods

### initTR064Device(host, port, callback, auth)

Initialize the TR - 064 UPnP controller

* `host` - hostname of the device 
* `port` - port of the device(standard: 49000) 
* `callback` - (err, device)
* `auth` - optional: object with user/password

### initIGDDevice(host, port, callback, auth)

Initialize the TR - 064 IGD controller

* `host` - hostname of the device 
* `port` - port of the device(standard: 49000) 
* `callback` - (err, device)
* `auth` - optional: object with user/password

### device.meta

Array with all info about services and actions

### device.services[`Service Identifier`]

Gets the specified service form the device

* `Service Identifier` - usually in the form of: urn:dslforum-org:service:XXX:1

### service.actions.XXX([args], callback)
* `args` - Array of args to configure or read a service.
* `callback` - (err, result)
