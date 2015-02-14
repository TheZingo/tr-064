var parseString = require('xml2js').parseString;
var inspect = require('eyes').inspector({maxLength: false, hideFunctions:false})
var request = require('request');
var md5 = require(__dirname + '/../node_modules/www-authenticate/lib/md5.js');
var www_authenticate = require('www-authenticate');
var digest = require('digest-header');

function Service(deviceInfo,serviceInfo,callback){
	this.host = deviceInfo.host;
	this.port = deviceInfo.port;
	this.user = deviceInfo.user;
	this.password = deviceInfo.password;
	this.meta = serviceInfo;
	this.meta.actionsInfo = [];
	this.readyCallback = callback;
	this.actions = {};
	this.stateVariables = {};
	_parseSCPD(this);
	
}
Service.prototype.listActions = function(){};
Service.prototype.listStateVariables = function(){};


var _pushArg = function(argument, inArgs, outArgs){
	if(argument.direction == "in"){
    	inArgs.push(argument.name);
    } else if(argument.direction == "out"){
    	outArgs.push(argument.name);
    }
}


var _parseActions = function(actionData){
	if(!Array.isArray(actionData)){
		return;
	}
	var insA = bind(this, _insertAction);
	actionData.forEach(insA)
};

var _parseSCPD = function(obj){
	var url = "http://" + obj.host + ":" + obj.port + obj.meta.SCPDURL;
	request(url, function (error, response, body) {
  		if (!error && response.statusCode == 200) {
    		parseString(body, {explicitArray : false},function (err, result) {	
    			var pA = bind(obj,_parseActions);
    			var pV = bind(obj,_parseStateVariables);
    			pA(result.scpd.actionList.action);
    			pV(result.scpd.serviceStateTable.stateVariable);  	
    			obj.readyCallback(null,obj);
  			});
		} else {
			console.log(url);
		}
	})
};

var _insertAction = function(el){
    	var outArgs = [];
    	var inArgs =[];
    	if(el.argumentList && Array.isArray(el.argumentList.argument) ) {
    		el.argumentList.argument.forEach(function(argument){
    			_pushArg(argument,inArgs,outArgs);
    		});
    	} else if(el.argumentList){
    		_pushArg(el.argumentList.argument,inArgs,outArgs);
    	}
    	this.actions[el.name] = bind(this,function(vars, callback){this._callAction(el.name, inArgs, outArgs, vars, callback)})
    	this.meta.actionsInfo.push({name: el.name, inArgs: inArgs, outArgs: outArgs});
}

Service.prototype._callAction = function(name, inArguments, outArguments, vars, callback){
	
	if(typeof vars === 'function'){
		callback = vars;
		vars = [];
	}

	this._sendSOAPActionRequest(this.host, this.port, this.meta.controlURL, this.meta.serviceType, name, inArguments, outArguments, vars, callback, this.user, this.password);
}

Service.prototype._subscribeStateVariableChangeEvent = function(sv, callback){
	inspect(arguments);
}

function bind(scope, fn){
	return function(){
		return fn.apply(scope,arguments);
	}
}

var _insertStateVariables = function(sv){
	if(sv.$.sendEvents == "yes"){
		this.stateVariables[sv.name] = bind(this,function(callback){this._subscribeStateVariableChangeEvent(sv, callback)})
	}
}

var _parseStateVariables = function(stateVariableData){
	var insSV = bind(this, _insertStateVariables);
	if(Array.isArray(stateVariableData)) {
		stateVariableData.forEach(insSV);
	} else if(typeof stateVariableData === 'object'){
		insSV(stateVariableData);
	}
};

var buildSoapRequest = function(serviceType, action, user, password, realm, nonce) {

	var authPart = "";
	if(typeof realm != "undefined") {
		var secret = md5(user + ':' + realm + ':' + password);
		var responseAuth = md5(secret + ':' + nonce);
		authPart = '<h:ClientAuth xmlns:h="http://soap-authentication.org/digest/2001/10/" s:mustUnderstand="1">'+
				'<Nonce>' + nonce + '</Nonce>' +
				'<Auth>' + responseAuth + '</Auth>' +
				'<UserID>' + user + '</UserID>' +
				'<Realm>' + realm + '</Realm>' +
			  '</h:ClientAuth>';			  
	} else if(typeof user != "undefined") {
		authPart = "<h:InitChallenge xmlns:h=\"http://soap-authentication.org/digest/2001/10/\" s:mustUnderstand=\"1\"><UserID>" + user + "</UserID></h:InitChallenge>";
	}

	var body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
			"<s:Envelope s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\" xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\">" +
			'<s:Header>'+
			  authPart +
			'</s:Header>'+
			"<s:Body>"+
			"<u:" + action + " xmlns:u=\"" + serviceType + "\">";
	// Args..
	body = body + "</u:" + action + ">" +
			"</s:Body>" +
			"</s:Envelope>";
			
	return body;
}

var handleAnswer = function(error, result, action, outArguments, callback) {
	
	var res = {};
	if(outArguments) {
		var responseVars = result['s:Envelope']['s:Body']['u:' + action + 'Response'];
		outArguments.forEach(function(arg){
		  res[arg] = responseVars[arg];
		})
	}
	callback(error,res)
}

Service.prototype._sendSOAPActionRequest = function(host, port, url, serviceType, action, inArguments, outArguments, vars, callback, user, password){

	var method = 'POST';
	var uri = "http://" + host + ":" + port + url;
	var headers = {
	  "SoapAction": serviceType + "#" + action
	  ,"Content-Type" : "text/xml; charset=\"utf-8\""
	};
	var body = buildSoapRequest(serviceType, action, user);

	request({
		method: method
		, uri: uri
		, headers: headers
		, body: body
		}
	  , function (error, response, body) {
	  
		  // response is ok (no unauthorized answer)
		  if(response.statusCode == 200){
			
			// parse XML result
			parseString(body, {explicitArray : false},function (err, result) {

				// check if the result contains an authentication challenge (i.e. the resource is secured on content level)
				if(result.hasOwnProperty('s:Envelope') && result['s:Envelope'].hasOwnProperty('s:Header') && result['s:Envelope']['s:Header'].hasOwnProperty('h:Challenge')) {
					var parsed = result['s:Envelope']['s:Header']['h:Challenge'];
					
					// rebuild the soap request with authentication soap header using the realm/nonce of the last answert
					var body = buildSoapRequest(serviceType, action, user, password, parsed.Realm, parsed.Nonce);

					// start a second request
					request({
					  method: method
					  , uri: uri
					  , headers: headers
					  , body: body
					  }
					, function (error, response, body) {
					  if(response.statusCode == 200) {					  
						parseString(body, {explicitArray : false},function (err, result) {
						  handleAnswer(error, result, action, outArguments, callback);
						});
					  } else {
						error = new Error("second try sendSOAPActionRequest Error: " + response.statusCode);
						callback(error,body)
					  }
					});
				} else {
					handleAnswer(error, result, action, outArguments, callback);
				}
			
			});
					  
		  } 
		  // response is unauthorized (use digest and retry the request)
		  else if(response.statusCode == 401){
				
				// set digest response header
				headers["Authorization"] = digest(method, url, response.headers['www-authenticate'], user + ':' + password);
				
				// rebuild soap request body
				var body = buildSoapRequest(serviceType, action);

				// start a second request
				request({
					  method: method
					  , uri: uri
					  , headers: headers
					  , body: body
					  }
					, function (error, response, body) {
						if(response.statusCode == 200){			
							parseString(body, {explicitArray : false},function (err, result) {
								handleAnswer(error, result, action, outArguments, callback);
							});
						} else {
							error = new Error("second try sendSOAPActionRequest Error: " + response.statusCode);
							callback(error,body)
						}
					});
		  } else {
			error = new Error("sendSOAPActionRequest Error: " + response.statusCode);
			callback(error, body)
		  }
		}
  )
}


Service.prototype.sendSOAPEventSubscribeRequest = function(callback){
  console.log("Send EventSubscribe...");
  request(
    { method: 'SUBSCRIBE'
    , uri: "http://" + this.host + ":" + this.port + this.meta.eventSubURL
    ,headers: {
		 "CALLBACK": "<http://192.168.178.28:44880/>"
        ,"NT" : "upnp:event"
        ,"TIMEOUT" : "Second-infinite"
      }
    }
  , function (error, response, body) {
      console.log("END");
      if(response.statusCode == 200){
        console.log("EventSubscribeRequest OK");
      } else {
        error = new Error("EventSubscribeRequest Error: " + response.statusCode);
        console.log('error: ' + response.statusCode)
        console.log(body)
      }
    }
  )
}




exports.Service = Service;