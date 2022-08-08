"use strict";Object.defineProperty(exports,"__esModule",{value:!0}),exports.handler=exports.forceSdkInstallation=exports.flatten=exports.PHYSICAL_RESOURCE_ID_REFERENCE=void 0;const child_process_1=require("child_process"),fs=require("fs"),path_1=require("path");exports.PHYSICAL_RESOURCE_ID_REFERENCE="PHYSICAL:RESOURCEID:";function flatten(object){return Object.assign({},...function _flatten(child,path=[]){return[].concat(...Object.keys(child).map(key=>{const childKey=Buffer.isBuffer(child[key])?child[key].toString("utf8"):child[key];return typeof childKey=="object"&&childKey!==null?_flatten(childKey,path.concat([key])):{[path.concat([key]).join(".")]:childKey}}))}(object))}exports.flatten=flatten;function decodeSpecialValues(object,physicalResourceId){return JSON.parse(JSON.stringify(object),(_k,v)=>{switch(v){case exports.PHYSICAL_RESOURCE_ID_REFERENCE:return physicalResourceId;default:return v}})}function filterKeys(object,pred){return Object.entries(object).reduce((acc,[k,v])=>pred(k)?{...acc,[k]:v}:acc,{})}let latestSdkInstalled=!1;function forceSdkInstallation(){latestSdkInstalled=!1}exports.forceSdkInstallation=forceSdkInstallation;function installLatestSdk(){console.log("Installing latest AWS SDK v2"),child_process_1.execSync("HOME=/tmp npm install aws-sdk@2 --production --no-package-lock --no-save --prefix /tmp"),latestSdkInstalled=!0}const patchedServices=[];function patchSdk(awsSdk){const apiLoader=awsSdk.apiLoader;return patchedServices.forEach(({serviceName,apiVersions})=>{const lowerServiceName=serviceName.toLowerCase();awsSdk.Service.hasService(lowerServiceName)?awsSdk.Service.addVersions(awsSdk[serviceName],apiVersions):(apiLoader.services[lowerServiceName]={},awsSdk[serviceName]=awsSdk.Service.defineService(lowerServiceName,apiVersions)),apiVersions.forEach(apiVersion=>{Object.defineProperty(apiLoader.services[lowerServiceName],apiVersion,{get:function(){const modelFilePrefix=`aws-sdk-patch/${lowerServiceName}-${apiVersion}`,model=JSON.parse(fs.readFileSync(path_1.join(__dirname,`${modelFilePrefix}.service.json`),"utf-8"));return model.paginators=JSON.parse(fs.readFileSync(path_1.join(__dirname,`${modelFilePrefix}.paginators.json`),"utf-8")).pagination,model},enumerable:!0,configurable:!0})})}),awsSdk}async function handler(event,context){try{let AWS;if(!latestSdkInstalled&&event.ResourceProperties.InstallLatestAwsSdk==="true")try{installLatestSdk(),AWS=require("/tmp/node_modules/aws-sdk")}catch(e){console.log(`Failed to install latest AWS SDK v2: ${e}`),AWS=require("aws-sdk")}else latestSdkInstalled?AWS=require("/tmp/node_modules/aws-sdk"):AWS=require("aws-sdk");try{AWS=patchSdk(AWS)}catch(e){console.log(`Failed to patch AWS SDK: ${e}. Proceeding with the installed copy.`)}console.log(JSON.stringify({...event,ResponseURL:"..."})),console.log("AWS SDK VERSION: "+AWS.VERSION),event.ResourceProperties.Create=decodeCall(event.ResourceProperties.Create),event.ResourceProperties.Update=decodeCall(event.ResourceProperties.Update),event.ResourceProperties.Delete=decodeCall(event.ResourceProperties.Delete);let physicalResourceId;switch(event.RequestType){case"Create":physicalResourceId=event.ResourceProperties.Create?.physicalResourceId?.id??event.ResourceProperties.Update?.physicalResourceId?.id??event.ResourceProperties.Delete?.physicalResourceId?.id??event.LogicalResourceId;break;case"Update":case"Delete":physicalResourceId=event.ResourceProperties[event.RequestType]?.physicalResourceId?.id??event.PhysicalResourceId;break}let flatData={},data={};const call=event.ResourceProperties[event.RequestType];if(call){let credentials;if(call.assumedRoleArn){const timestamp=new Date().getTime(),params={RoleArn:call.assumedRoleArn,RoleSessionName:`${timestamp}-${physicalResourceId}`.substring(0,64)};credentials=new AWS.ChainableTemporaryCredentials({params})}if(!Object.prototype.hasOwnProperty.call(AWS,call.service))throw Error(`Service ${call.service} does not exist in AWS SDK version ${AWS.VERSION}.`);const awsService=new AWS[call.service]({apiVersion:call.apiVersion,credentials,region:call.region});try{const response=await awsService[call.action](call.parameters&&decodeSpecialValues(call.parameters,physicalResourceId)).promise();flatData={apiVersion:awsService.config.apiVersion,region:awsService.config.region,...flatten(response)};let outputPaths;call.outputPath?outputPaths=[call.outputPath]:call.outputPaths&&(outputPaths=call.outputPaths),outputPaths?data=filterKeys(flatData,startsWithOneOf(outputPaths)):data=flatData}catch(e){if(!call.ignoreErrorCodesMatching||!new RegExp(call.ignoreErrorCodesMatching).test(e.code))throw e}call.physicalResourceId?.responsePath&&(physicalResourceId=flatData[call.physicalResourceId.responsePath])}await respond("SUCCESS","OK",physicalResourceId,data)}catch(e){console.log(e),await respond("FAILED",e.message||"Internal Error",context.logStreamName,{})}function respond(responseStatus,reason,physicalResourceId,data){const responseBody=JSON.stringify({Status:responseStatus,Reason:reason,PhysicalResourceId:physicalResourceId,StackId:event.StackId,RequestId:event.RequestId,LogicalResourceId:event.LogicalResourceId,NoEcho:!1,Data:data});console.log("Responding",responseBody);const parsedUrl=require("url").parse(event.ResponseURL),requestOptions={hostname:parsedUrl.hostname,path:parsedUrl.path,method:"PUT",headers:{"content-type":"","content-length":responseBody.length}};return new Promise((resolve,reject)=>{try{const request=require("https").request(requestOptions,resolve);request.on("error",reject),request.write(responseBody),request.end()}catch(e){reject(e)}})}}exports.handler=handler;function decodeCall(call){if(!!call)return JSON.parse(call)}function startsWithOneOf(searchStrings){return function(string){for(const searchString of searchStrings)if(string.startsWith(searchString))return!0;return!1}}
//# sourceMappingURL=index.js.map