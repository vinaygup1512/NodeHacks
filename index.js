var http = require('http');
var fs = require("fs");
var path = require('path');
var url = require('url');
var cheerio = require('cheerio');
var Excel = require('exceljs');
var constructs = ['table','figure','heading','para','list','footnote','formula','artifacts','code','extra','dataloss','flowchart'];
var score = ['Major Improvement','Minor Improvement','Major Degradation','Minor Degradation','NoChange'];
var publicBaseDir = "./public";
var isExcelPaused = false;
//var isFileOpPaused = false;

  // After instantiation, you can grab the readstream at any time.
function mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
  const sep = path.sep;
  const initDir = path.isAbsolute(targetDir) ? sep : '';
  const baseDir = isRelativeToScript ? __dirname : '.';

  return targetDir.split(sep).reduce((parentDir, childDir) => {
    const curDir = path.resolve(baseDir, parentDir, childDir);
    try {
      fs.mkdirSync(curDir);
    } catch (err) {
      if (err.code === 'EEXIST') { // curDir already exists!
        return curDir;
      }

      // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
      if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
        throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
      }

      const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
      if (!caughtErr || caughtErr && targetDir === curDir) {
        throw err; // Throw if it's just the last created dir.
      }
    }
    return curDir;
  }, initDir);
}

http.createServer(function (req, res) {
  var requestURL = '.' + req.url;
  try{
    if(requestURL.startsWith("./copyFile"))
      copyFile(requestURL,res);
    else if(requestURL.startsWith("./getFolderPath"))
      getFolderPath(requestURL,res);
    else if(requestURL.startsWith("./analysisPage"))
      openAnalysis(requestURL,res);
    else if(requestURL.startsWith("./fillAnalysisPage"))
      fillAnalysis(requestURL,res);
    else
      openHome(req, res);
  }catch(err){
    overriddenThrow(err,res);
  }
}).listen(80);

function overriddenThrow(err,res){
  var response = {
    status  : 500,
    error : 'Exception occurred '+err.message
  }
  writeErrorLog(err.message);
  console.log("Overridden throw response", response.status);
  res.writeHead(500, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(response));
}
function writeErrorLog(errorMsg){
  var today = new Date();
  var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
  if(!fs.existsSync("ErrorLog_"+date+".log")) {
    fs.writeFileSync("ErrorLog_"+date+".log", "\n###################\n["+today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds()+"]"+errorMsg+"\n##################\n", (err) => {  
      if (err) console.log("[Error]"+err);
    });
  } else {
    fs.appendFileSync("ErrorLog_"+date+".log", "\n###################\n["+today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds()+"]"+errorMsg+"\n###################\n", (err) => {  
      if (err) console.log("[Error]"+err);
    });
  }
}

function openAnalysis(requestURL,res){
  fs.readFile('analysispage.html', function(err, data) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data,'utf-8');
      res.end();
  });
}

function getMeepScoreFromExcel(res,fileList,absFileName,analysisType){
  var workbook = new Excel.Workbook();
  var fileMap = new Map();
  var finalMap = {};
  if(fs.existsSync(absFileName)){
    workbook.csv.readFile(absFileName).then(worksheet => {
      worksheet.eachRow({ includeEmpty: true }, function(row, rowNumber) {
        fileMap[JSON.stringify(row.values[1]).split("\\t")[0].replace('"',"")] = JSON.stringify(row.values[1]).split("\\t")[1]+"##"+JSON.stringify(row.values[1]).split("\\t")[2];
      });
      //console.log(fileMap);
      for(var file in fileList){
        if(typeof fileMap[fileList[file].replace(".png","")]!=='undefined')
          finalMap[fileList[file]] = fileMap[fileList[file].replace(".png","")];
        else
          finalMap[fileList[file]] = "-##-";
      }
      //console.log(finalMap);
      var response = {
        status  : 200,
        success : 'File list retrieved successfully',
        analysisType: analysisType,
        fileMap: finalMap
      }
      
      res.writeHead(200, {'Content-Type': 'text/json'});
      res.end(JSON.stringify(response));
    }); 
  }else{
    for(var file in fileList)
      finalMap[fileList[file]] = "-##-";
    var response = {
        status  : 200,
        success : 'File list retrieved successfully',
        analysisType: analysisType,
        fileMap: finalMap
      }
      res.writeHead(200, {'Content-Type': 'text/json'});
      res.end(JSON.stringify(response));
  }
}

function fillAnalysis(requestURL,res){
  var url_parts = url.parse(requestURL, true);
  var query = url_parts.query;
  var fileList = new Array();
  var fileMap = new Map();
  var newIRPath = query["modelIRPath"];//"/Model244/yodair_pngs";
  var baseIRPath = query["modelBaseIRPath"];//"/Model44/results";
  var newPDFPath = query["newPDFPath"];  
  var analysisType = query["analysisType"]; 
  
  fs.readdirSync(publicBaseDir+newIRPath).forEach(file => {
    if(file.endsWith(".png"))
      if(analysisType!="baseline"){
        if(fs.existsSync(path.join(publicBaseDir+baseIRPath,file))) 
          fileList.push(file);
      }
      else
        fileList.push(file);
  });
  //Sort basis on number in string suffix 
  fileList.sort(function(a,b){
    if((!isNaN(a.substring(a.lastIndexOf("-")+1,a.lastIndexOf(".png")))) && (a.substring(0,a.lastIndexOf("-"))==b.substring(0,b.lastIndexOf("-")))){
      return a.substring(a.lastIndexOf("-")+1,a.lastIndexOf(".png")) - b.substring(b.lastIndexOf("-")+1,b.lastIndexOf(".png"));
    }      
    else
      return (a >= b)-(a <= b);
  });
  getMeepScoreFromExcel(res,fileList,path.join(publicBaseDir+newPDFPath,"Q_edgescores.tsv"),analysisType);
}

function getFolderPath(requestURL, res){
  var url_parts = url.parse(requestURL, true);
  var query = url_parts.query;
  var newOption = '<option value=\'none\'>None</option>';
  fs.readdirSync(publicBaseDir+query["path"]).forEach(file => {
    if(fs.lstatSync(publicBaseDir+query["path"]+"/"+file).isDirectory())
      newOption = newOption+'<option value=\''+file+'\'>'+file+'</option>'
  });
  var response = {
    status  : 200,
    success : 'Updated Successfully',
    html: newOption
  }

  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(response));
}

function openHome(req, res) {
  var fileList=new Array();
  fs.readdirSync(publicBaseDir).forEach(file => {
    if(fs.lstatSync(publicBaseDir+"/"+file).isDirectory())
      fileList.push(file);
  });
  fs.readFile('home.html', function(err, data) {
      var $ = cheerio.load(data);      
      var newOption = '<option value=\'none\'>None</option>';
      for (var value in fileList) 
        newOption = newOption+'<option value=\''+fileList[value]+'\'>'+fileList[value]+'</option>'
      if(fileList.length>0){
        $('.modelML').html(newOption);
        $('.modelIR').html(newOption);
        $('.basemodelIR').html(newOption);
        $('.basePDF').html(newOption);
        $('.newPDF').html(newOption);

        $('.modelIR_baseline').html(newOption);
        $('.newPDF_baseline').html(newOption);
        data = $.html();
      }
      
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data,'utf-8');
      res.end();
  });     
}

function merge(obj, src) {
    for (var key in src) {
        if (src.hasOwnProperty(key)) obj[key] = src[key];
    }
    return obj;
}

function copyFile(requestURL,res){
  var url_parts = url.parse(requestURL, true);
  var query = url_parts.query;
  var inData = new Map();
  var excelData = new Map();
  var scoreData = new Map();
  var constructData = new Map();
  var folderList = new Array();
  var dvstatus="";
  var excelPath = "";
  var resfolder="";
  
  //Map creation from request - This code works per query key
  for (const key in query) {
    if(key == 'analysisType'){
      inData["analysisType"] = query[key];
      continue;
    }
    if(key == 'fullMLPath'){
      inData["pngMLFilePath"] = path.join(publicBaseDir,query[key]);
      continue;
    }
    else if(key == 'fullIRPath'){
      inData["pngIRFilePath"] = path.join(publicBaseDir,query[key]);
      continue;
    }
    else if(key == 'fullBaseIRPath'){
      inData["pngBaseIRFilePath"] = path.join(publicBaseDir,query[key]);
      continue;
    }
    else if(key == 'pdfFilePath'){
      inData["srcPdfFilePath"] = path.join(publicBaseDir,query[key]);
      continue;
    }
    else if(key == 'basePdfFilePath'){
      inData["srcBasePdfFilePath"] = path.join(publicBaseDir,query[key]);
      continue;
    }
    else if(key == 'fileName'){
      inData["pngfileName"] = query[key];
      continue;
    }
    else if(key == 'user'){
      inData["user"] = query[key];
      continue;
    }
    else if(key.includes('[meepPrediction]')){
      inData["meepPrediction"] = query[key];
      continue;
    }
    else if(key.includes('[meepScore]')){
      inData["meepScore"] = query[key];
      continue;
    }
    else{
      if(key.includes('[comments]')){
        inData["comments"] = query[key];
        continue;
      }

      if(key.includes('[issueIn]')){
        if (query[key] instanceof Array){
          for (var k = 0; k < query[key].length; k++) {
            if(query[key][k]=="issueIR")
              inData["issueIR"]="Yes";
            if(query[key][k]=="issueML")
              inData["issueML"]="Yes";
          }
        }else if(query[key]!=""){
          if(query[key]=="issueIR")
              inData["issueIR"]="Yes";
            else
              inData["issueML"]="Yes";
        }
        continue;
      }
    }
  } 
  
  if(inData["analysisType"]!="baseline"){
    for(var i=inData["pngMLFilePath"].indexOf("/")+1;i<inData["pngMLFilePath"].length;++i){
      if(inData["pngMLFilePath"][i]=="/"){
        for (var j=inData["pngMLFilePath"].indexOf("/")+1;j<i;++j)
          resfolder=resfolder+inData["pngMLFilePath"][j];
        break;
      }
    }
  } else{
    for(var i=inData["pngIRFilePath"].indexOf("/")+1;i<inData["pngIRFilePath"].length;++i){
      if(inData["pngIRFilePath"][i]=="/"){
        for (var j=inData["pngIRFilePath"].indexOf("/")+1;j<i;++j)
          resfolder=resfolder+inData["pngIRFilePath"][j];
        break;
      }
    }
  }
  //creation of final map and folderlist
  for (const key in query){
    for(var i=0;i<score.length;i++){
      if(key.includes('['+score[i]+']')){
        if(key.includes('NoChange')){
          scoreData["NoChange"]=query[key];
          folderList.push("NoChange"+query[key]);
          break;
        }
        else{
          for(var j=0;j<constructs.length;j++){
            if(key.includes('['+constructs[j]+']')){
              if(key.includes('[GoodDV]'))
                dvstatus="BadDVNo";
              else if(key.includes('[BadDV]'))
                dvstatus="BadDVYes";
              else
                dvstatus="none";

              var bucketData = "";
              if (query[key] instanceof Array){
                for (var k = 0; k < query[key].length; k++) {
                  /*if(score[i].includes("Degradation")){
                    if(dvstatus=="BadDVYes")
                      folderList.push(  score[i]+'/'+constructs[j]+'/'+query[key][k].replace(new RegExp(" ", 'g'),""));
                  }else*/
                    folderList.push(score[i]+'/'+constructs[j]+'/'+query[key][k].replace(new RegExp(" ", 'g'),""));                  

                  if(dvstatus!="none")
                    folderList.push(path.join("DVStatus",dvstatus,constructs[j],query[key][k].replace(new RegExp(" ", 'g'),"")));
                  if(bucketData!="")
                    bucketData = bucketData+';'+query[key][k];
                  else
                    bucketData = query[key][k];
                }
              }else if(query[key]!=""){
                /*if(score[i].includes("Degradation")){
                    if(dvstatus=="BadDVYes")
                      folderList.push(score[i]+'/'+constructs[j]+'/'+query[key].replace(new RegExp(" ", 'g'),""));
                }else*/
                  folderList.push(score[i]+'/'+constructs[j]+'/'+query[key].replace(new RegExp(" ", 'g'),""));

                if(dvstatus!="none")
                    folderList.push(path.join("DVStatus",dvstatus,constructs[j],query[key].replace(new RegExp(" ", 'g'),"")));
                bucketData = query[key];
              }
              var bucketDataWithDV = new Map();
              bucketDataWithDV[dvstatus] = bucketData;

              if(scoreData.hasOwnProperty(score[i])){
                constructData[constructs[j]] = bucketDataWithDV;
                scoreData[score[i]] = merge(scoreData[score[i]],constructData);
              }else{
                constructData = new Map()
                constructData[constructs[j]] = bucketDataWithDV;
                scoreData[score[i]] = constructData;
              }
	            if(((score[i]=="Major Improvement" && inData["meepScore"].split("##")[1]>0.4)||(score[i]=="Major Degradation" && inData["meepScore"].split("##")[1]<0.8)) && inData["meepPrediction"]!="matched") //means no override
	                inData["meepPrediction"]="mismatched";
            	else if(((score[i]=="Major Improvement" && inData["meepScore"].split("##")[1]<0.4)||(score[i]=="Major Degradation" && inData["meepScore"].split("##")[1]>0.8)) && inData["meepPrediction"]!="mismatched") //means no override
                	inData["meepPrediction"]="matched";
              break;
            }
          }
          break;
        }
      }
    }
  }
//End of request parsing into map - Post this step, you should have complete map in trimmed down fashion
  excelPath = path.join(publicBaseDir,resfolder+'_result',inData["user"]);
  
  excelData[inData["pngfileName"]] = scoreData;
  try{
    if(!fs.existsSync(excelPath))
      mkDirByPathSync(excelPath,{isRelativeToScript: true});
    excelPath = path.join(excelPath,'report.xlsx');

    if (!fs.existsSync(excelPath))
      createExcel(excelPath,res);
              
    updateExcel(excelPath,excelData,inData,res);

    //prefixing path since till now user will be populated
    for(var i =0;i<folderList.length;i++){
      folderList[i] = path.join(publicBaseDir,resfolder+'_result',folderList[i]);
      if(!(folderList[i].includes("NoChange")||folderList[i].includes("Improvement"))){
        if(inData["issueIR"]=="Yes" && inData["issueML"]!="Yes")
          folderList[i] = path.join(folderList[i],"issueIR");
        else if(inData["issueIR"]!="Yes" &&inData["issueML"]=="Yes")
          folderList[i] = path.join(folderList[i],"issueML");
        else if(inData["issueIR"]=="Yes" &&inData["issueML"]=="Yes")
          folderList[i] = path.join(folderList[i],"issueBoth");
      }
    }

  let filepromise = new Promise((resolve, reject) => {
      UpdateFilesAsync(inData,resfolder,folderList,res);
      resolve("Delete done!");
   });

  filepromise.then((message) => {console.log(message)})
  } catch(err){
    overriddenThrow(err,res);
  }
  var response = {
    status  : 200,
    success : 'File copied successfully'
  }
  console.log("CopyFile response 200");
  res.writeHead(200, {'Content-Type': 'text/json'});
  res.end(JSON.stringify(response));
}

function UpdateFilesAsync(inData,resultFolder,folderList,res){
  //isFileOpPaused = true;
  //Search for existing files and remove if they do not exist in folderList - Deletion workflow
  try{
    var deleteFiles = getToBeDeletedFiles(path.join(publicBaseDir,resultFolder+'_result'),new Array(), inData["pngfileName"], folderList);
    deleteFiles = checkPDFFilesToBeDeleted(deleteFiles,inData["pngfileName"]);
    for(var i =0;i<deleteFiles.length;i++){
      if (fs.existsSync(deleteFiles[i]))
        fs.unlinkSync(deleteFiles[i]);
    }
    copyFilesAsync(inData,folderList,res);
  }catch(err){
    overriddenThrow(err,res);
  }
}

//For PDF Removal follow steps:
                    //1. First condition matches the PNG - FolderList should not have dir present and file should be same as PNGFile - No other files should be touched
                    //2. Once we confirm the PDF, check if there are other PNG files from that PDF
                        //a. Traverse Files in that directory
                        //b. For a non pdf file, match PNG starting string to that of PDF file. If matches, remove from 'to be deleted' filelist.
function checkPDFFilesToBeDeleted(deleteFiles,pngfileName){
  var retainFiles = new Array();
  for(var i=0; i<deleteFiles.length;i++){
    if(deleteFiles[i].endsWith(".pdf")){
      var dir = deleteFiles[i].slice(0,deleteFiles[i].lastIndexOf(path.sep));
      fs.readdirSync(dir).forEach(file => { //checking other PNG related
          if(!file.endsWith(".pdf")){
            var boolIRBase = (file.replace("_IR_Base.png",".png")==pngfileName);
            var boolMLNew = (file.replace("_ML_New.png",".png")==pngfileName);
            var boolIRNew = (file.replace("_IR_New.png",".png")==pngfileName);
            if(!(boolIRBase||boolMLNew||boolIRNew)){
              if(retainFiles.indexOf(deleteFiles[i])==-1)
                retainFiles.push(deleteFiles[i]);
            }
          }
        });
    }
  }
  for(var i=0;i<retainFiles.length;i++){
    deleteFiles.splice(deleteFiles.indexOf(retainFiles[i]),1);
  }
  return deleteFiles;
}

function copyFilesAsync(inData,folderList,res){    
  for(var i =0;i<folderList.length;i++){
    //console.log(path.join(folderList[i],srcPdfFilePath.substring(srcPdfFilePath.lastIndexOf("/"),srcPdfFilePath.length).replace(".pdf","_new.pdf")));
    if (!fs.existsSync(folderList[i]))
      mkDirByPathSync(folderList[i],{isRelativeToScript: true});

    
    if (!fs.existsSync(path.join(folderList[i],inData["pngfileName"].replace(".png","_IR_New.png"))))
      fs.copyFile(inData["pngIRFilePath"], path.join(folderList[i],inData["pngfileName"].replace(".png","_IR_New.png")), (err) => {
      if (err) overriddenThrow(err,res);
      });
    if (!fs.existsSync(path.join(folderList[i],inData["srcPdfFilePath"].substring(inData["srcPdfFilePath"].lastIndexOf("/"),inData["srcPdfFilePath"].length).replace(".pdf","_new.pdf"))))
      fs.copyFile(inData["srcPdfFilePath"], path.join(folderList[i],inData["srcPdfFilePath"].substring(inData["srcPdfFilePath"].lastIndexOf("/"),inData["srcPdfFilePath"].length).replace(".pdf","_new.pdf")), (err) => {
      if (err) overriddenThrow(err,res);
      });
    if(inData["analysisType"]!="baseline"){
      if (!fs.existsSync(path.join(folderList[i],inData["pngfileName"].replace(".png","_ML_New.png"))))
        fs.copyFile(inData["pngMLFilePath"], path.join(folderList[i],inData["pngfileName"].replace(".png","_ML_New.png")), (err) => {
        if (err) overriddenThrow(err,res);
        });
      if (!fs.existsSync(path.join(folderList[i],inData["pngfileName"].replace(".png","_IR_Base.png"))))
        fs.copyFile(inData["pngBaseIRFilePath"], path.join(folderList[i],inData["pngfileName"].replace(".png","_IR_Base.png")), (err) => {
        if (err) overriddenThrow(err,res);
        });
      if (!fs.existsSync(path.join(folderList[i],inData["srcBasePdfFilePath"].substring(inData["srcBasePdfFilePath"].lastIndexOf("/"),inData["srcBasePdfFilePath"].length).replace(".pdf","_base.pdf"))))
        fs.copyFile(inData["srcBasePdfFilePath"], path.join(folderList[i],inData["srcBasePdfFilePath"].substring(inData["srcBasePdfFilePath"].lastIndexOf("/"),inData["srcBasePdfFilePath"].length).replace(".pdf","_base.pdf")), (err) => {
        if (err) overriddenThrow(err,res);
        });
    }
  }
}

function getToBeDeletedFiles(dir, filelist, pngfileName, folderList) {
            var path = path || require('path');
            var fs = fs || require('fs'),
            files = fs.readdirSync(dir);
            filelist = filelist || [];
            files.forEach(function(file) {
                if (fs.statSync(path.join(dir, file)).isDirectory()) {
                    filelist = getToBeDeletedFiles(path.join(dir, file), filelist, pngfileName, folderList);
                }
                else {
                  //console.log(file.replace("_IR_New.png",".png")==pngfileName && folderList.indexOf(dir)==-1, pngfileName, file);
                  if(file.replace("_ML_New.png",".png")==pngfileName && folderList.indexOf(dir)==-1)
                    filelist.push(path.join(dir, file));
                  if(file.replace("_IR_New.png",".png")==pngfileName && folderList.indexOf(dir)==-1)
                    filelist.push(path.join(dir, file));
                  if(file.replace("_IR_Base.png",".png")==pngfileName && folderList.indexOf(dir)==-1)
                    filelist.push(path.join(dir, file));

                  if(file==(pngfileName.slice(0,pngfileName.lastIndexOf('-'))+"_base.pdf") && folderList.indexOf(dir)==-1)
                    filelist.push(path.join(dir, file));
                  if(file==(pngfileName.slice(0,pngfileName.lastIndexOf('-'))+"_new.pdf") && folderList.indexOf(dir)==-1)
                    filelist.push(path.join(dir, file));
                }
              });
            return filelist;
        };

function isEmptyObject( obj ) {
    for ( var name in obj ) {
        return false;
    }
    return true;
}

function createExcel(excelName,res){
  try{
    isExcelPaused = true;
    var workbook = new Excel.Workbook();
    var fillOnce = true;
    var worksheet = workbook.addWorksheet('Sheet1');
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Page Score', key: 'score', width: 35 },
      { header: 'Issue Construct', key: 'construct', width: 20 },
      { header: 'Bucket', key: 'bucket', width: 20 },
      { header: 'DV Status', key: 'dv', width: 10 },
      { header: 'Issue in IR', key: 'issueIR', width: 40 },
      { header: 'Issue in ML', key: 'issueML', width: 40 },
      { header: 'Comments', key: 'comments', width: 60 },
      { header: 'Base Meep Score', key: 'baseMeep', width: 60 }, 
      { header: 'New Meep Score', key: 'newMeep', width: 60 },     
      { header: 'Meep Prediction', key: 'comments', width: 60 },
      { header: 'Assignee', key: 'assignee', width: 20 }
    ];
    let promise = new Promise((resolve, reject) => {
      workbook.xlsx.writeFile(excelName).then(function() {
        isExcelPaused = false;
        resolve("create done!");
    }) });

    promise.then((message) => console.log(message));
  }catch(err){
    overriddenThrow(err,res);
  }
}

function updateExcel(excelName,excelData,inData,res){
  try{
    if (isExcelPaused) {
              setTimeout(function(){updateExcel(excelName,excelData,inData,res)},100);
    } else {
      var workbook = new Excel.Workbook();
      var fillOnce = true;
      
      workbook.xlsx.readFile(excelName)
        .then(function() {
            var worksheet = workbook.getWorksheet('Sheet1');
            var rowC = worksheet.lastRow;
            var rowCount = rowC.number;
            var row = worksheet.getRow(++rowCount);
            var scoreData = excelData[inData["pngfileName"]];
            if(!isEmptyObject(scoreData)){
            var foundDuplicate = false;
            for (const [ikey, ivalue] of Object.entries(scoreData)){
              if(ikey=="NoChange"){
                for(var i=1;i<rowCount;i++){
                  row = worksheet.getRow(i);
                  if(row.getCell(1).value == inData["pngfileName"] && row.getCell(2).value==ikey+"_"+ivalue){
                    foundDuplicate=true;
                    break;
                  }
                }
                if(!foundDuplicate){
                  row = worksheet.getRow(rowCount++);
                  row.getCell(1).value = inData["pngfileName"]; 
                  row.getCell(2).value = ikey+"_"+ivalue;
                  row.getCell(5).value = "";  //no dv status for no change
                  row.getCell(6).value = inData["issueIR"];
                  row.getCell(7).value = inData["issueML"];
                  row.getCell(8).value = inData["comments"];
                  row.getCell(9).value = inData["meepScore"].split("##")[0];
                  row.getCell(10).value = inData["meepScore"].split("##")[1];
                  row.getCell(11).value = inData["meepPrediction"]=="none"?"":inData["meepPrediction"];
                  row.getCell(12).value = inData["user"];
                  row.commit();
                }
                break;
              }

              var constructData = ivalue;
              for (const [jkey, jvalue] of Object.entries(constructData)){
                var dvstatusData = jvalue;
                for (const [dkey, dvalue] of Object.entries(dvstatusData)){
                  var bucket = dvalue;
                  var duplicateUpdated = false;
                  //For updation workflow
                  for(var i=1;i<rowCount;i++){
                    row = worksheet.getRow(i);
                   // console.log(row.getCell(1).value,fileName,row.getCell(2).value,ikey, row.getCell(3).value,jkey,row.getCell(5),(dkey=="none"?"":dkey));
                    if(row.getCell(1).value == inData["pngfileName"] && row.getCell(2).value==ikey && row.getCell(3).value==jkey && row.getCell(5)==(dkey=="none"?"":dkey)){
                      //row.getCell(5).value = dkey=="none"?"":dkey; //no dv status for improvements but only for degradation
                      row.getCell(4).value = bucket
                      row.getCell(6).value = inData["issueIR"];
                      row.getCell(7).value = inData["issueML"];
                      if(fillOnce){
                        row.getCell(8).value = inData["comments"];
                        fillOnce=false;
                      }
                      row.getCell(9).value = inData["meepScore"].split("##")[0];
                      row.getCell(10).value = inData["meepScore"].split("##")[1];
                      row.getCell(11).value = inData["meepPrediction"]=="none"?"":inData["meepPrediction"];
                      row.getCell(12).value = inData["user"];
                      row.commit();
                      duplicateUpdated = true;
                      break;
                    }
                  }
                  if(!duplicateUpdated){
                    row = worksheet.getRow(rowCount++);
                    row.getCell(1).value = inData["pngfileName"]; 
                    row.getCell(2).value = ikey;
                    row.getCell(3).value = jkey;
                    row.getCell(4).value = bucket;
                    row.getCell(5).value = dkey=="none"?"":dkey;
                    row.getCell(6).value = inData["issueIR"];
                    row.getCell(7).value = inData["issueML"];
                    if(fillOnce){
                      row.getCell(8).value = inData["comments"];
                      fillOnce=false;
                    }
                    row.getCell(9).value = inData["meepScore"].split("##")[0];
                    row.getCell(10).value = inData["meepScore"].split("##")[1];
                    row.getCell(11).value = inData["meepPrediction"]=="none"?"":inData["meepPrediction"];
                    row.getCell(12).value = inData["user"];
                    row.commit();
                  }
                }
              }
            }
          }
          let promise = new Promise((resolve, reject) => {
            workbook.xlsx.writeFile(excelName).then(function() {
          resolve("update done!");

          }); });
          promise.then((message)=> console.log(message));
        })
      }
    }catch(err){
      overriddenThrow(err,res);
    }
}
