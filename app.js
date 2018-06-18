const request = require("request");

var http = require('http'),
  connect = require('connect'),
  httpProxy = require('http-proxy');
  var https = require('https');
var app = connect();
var path = require('path')

var fs = require('fs');

// This line is from the Node.js HTTPS documentation.
var options = {
  key: fs.readFileSync('private.key'),
  cert: fs.readFileSync('certificate.crt')
};


var urlStorage = {
  "/start.m3u8": {
    "path": "/hls_beta/jingle.mp4/master.m3u8",
    "count": -1,
    "expire": -1
  },
  "/chuni.m3u8": {
    "path": "/hls_beta/chuni01.mp4/master.m3u8",
    "count": -1,
    "expire": -1
  },
  "/badapple.m3u8": {
    "path": "/hls_beta/badapple.mp4/master.m3u8",
    "count": -1,
    "expire": -1
  },
  "/maidragon.m3u8": {
    "path": "/hls_beta/maidragon01.mp4/master.m3u8",
    "count": -1,
    "expire": -1
  },
};

var per_user_url = {};

var randomstring = require("randomstring");
var streamallowed = true;
var url = require("url");

var proxy = httpProxy.createProxyServer({});
var transformerProxy = require("transformer-proxy");

String.prototype.replaceAll = function(search, replacement) {
  var target = this;
  return target.split(search).join(replacement);
};


var transformerFunction_m3u8 = function(data, req, res) {

  var requrl = new URL("http://test" + req.url);

  var sid;
  if (typeof urlStorage[requrl['pathname']].sid == "undefined") {

    sid = randomstring.generate(32);
  } else {

    sid = urlStorage[requrl['pathname']].sid;
  }


  var response = "";
  data.toString().split("\n").forEach(element => {
    if (element.startsWith("http")) {
      //URL
      var anotherUrl = new URL(element);
      var newPath = randomstring.generate(32) + path.extname(anotherUrl.pathname);
      urlStorage["/" + newPath] = {}; // 주소 등록
      urlStorage["/" + newPath]['path'] = anotherUrl.pathname; // 주소 등록
      urlStorage["/" + newPath]['count'] = -1; // 주소 등록
      urlStorage["/" + newPath]['expire'] = (+new Date) + (30 * 60 * 1000); // 20초동안 유효
      urlStorage["/" + newPath]['sid'] = sid; // 20초동안 유효
      urlStorage["/" + newPath]['active'] = true;
      urlStorage["/" + newPath]['expired'] = false;
      anotherUrl.pathname = "/" + newPath;
      anotherUrl.host = "streambill.oganime.tr4.win";
      anotherUrl.protocol = "https:";
      //anotherUrl.query.sid = sid; // 디버깅용
      response += anotherUrl.href + "\n";
    } else {
      //기타문항
      response += element + "\n";
    }
  });


  if (urlStorage[requrl['pathname']]['count'] == 1) {

    urlStorage[requrl['pathname']].active = false;
  } else {

    urlStorage[requrl['pathname']]['count']--;
  }




  return response;

}


//만료된 라우팅을 지우는 코드
setInterval(function() {
  for (var key in urlStorage) {
    var data = urlStorage[key];

    if (!urlStorage[key].expired && data.expire > 0 && data.expire < (+new Date)) {
      console.log(data.path + " has been expired, so Deleting it.");
      urlStorage[key].active=false;
      urlStorage[key].expired=true;
    }

  }
}, 1000);


//
//app.use(transformerProxy(transformerFunction));
app.use(function(req, res, next) {
  procReq(req, res, next);
});
var timeoutTimer = false;

function procReq(req, res, next) {
  res.setHeader("server", "oganime-streaming-router");


  console.log("REQ] :: " + req.method + " / " + req.url);




  var requestData = new URL("http://my" + req.url);

  if (req.method == "GET") {

    if (typeof urlStorage[requestData.pathname] !== "undefined") {

        if(urlStorage[requestData.pathname].active){

      var originalUrl = urlStorage[requestData.pathname].path;
      if (originalUrl.endsWith(".m3u8")) {
        transformerProxy(transformerFunction_m3u8)(req, res, function() {});
      }
      //console.log(urlStorage);


      //console.log("https://stream.oganime.com" + originalUrl);
      proxy.web(req, res, {
        target: "http://10.0.3.237:8001" + originalUrl,
        secure: false,
        ignorePath: true
      });
    } else {

        res.statusCode = 403;
        res.setHeader("content-type", "text/html; charset=UTF-8");
  console.log("In-Same-Time Streaming has been detected.");
        res.end(
          '<meta charset="utf-8"><h1>403 Forbidden</h1>동시시청 적발입니다. 관리자에게 보고합니다.<br><br><hr><b><center>OGAnime Streaming Server, Version 0.1</center></b>'
        );

    }

    } else {
      res.statusCode = 403;
      res.setHeader("content-type", "text/html; charset=UTF-8");

      res.end(
        '<meta charset="utf-8"><h1>403 Forbidden</h1>요청하신 URL은 정상적인 스트리밍 URL이 아닌 것으로 보입니다.<br>\
최초 플레이로부터 시간이 조금 지났으면 홈페이지에서 처음부터 재생 시도를 해 보세요.<br><br><hr><b><center>OGAnime Streaming Server, Version 0.1</center></b>'
      );
    }

  } else if (req.method == "DELETE") {

    if (req.headers['x-auth-key'] != "oganime-web-fp01") {

      res.statusCode = 403;
      res.setHeader("content-type", "text/html; charset=UTF-8");

      res.end(
        '<meta charset="utf-8"><h1>403 Forbidden</h1>권한이 부족하여 요청하신 명령을 수행하지 못했습니다.<br><br><hr><b><center>OGAnime Streaming Server, Version 0.1</center></b>'
      );

    } else {

      var parser = req.url.split("/");

      if (parser[1] == "url") {
        //URL 지우기
        urlStorage["/" + parser[2]].active=false;
      } else if (parser[1] == "sid") {


        for (var key in urlStorage) {
          var data = urlStorage[key];

          if (data.sid == parser[2]) {
            console.log(data.path + " will deleted per this delete request.");
            urlStorage[key].active=false;
          }

        }

      }

      res.end("ok");
    }
  } else if (req.method == "PUT") {
    var parser = req.url.split("/");


    if (req.headers['x-auth-key'] != "oganime-web-fp01") {

      res.statusCode = 403;
      res.setHeader("content-type", "text/html; charset=UTF-8");

      res.end(
        '<meta charset="utf-8"><h1>403 Forbidden</h1>권한이 부족하여 요청하신 명령을 수행하지 못했습니다.<br><br><hr><b><center>OGAnime Streaming Server, Version 0.1</center></b>'
      );
    } else {
var urlto = "/" + randomstring.generate(16) + ".m3u8";
      urlStorage[urlto] = {}; // 주소 등록
      urlStorage[urlto]['path'] = "/hls_beta/" + parser[1] + "/master.m3u8"; // 주소 등록
      urlStorage[urlto]['count'] = -1; // 주소 등록
      urlStorage[urlto]['expire'] = parseInt((+new Date)) + parseInt(parser[2]); // 20초동안 유효
      urlStorage[urlto]['sid'] = parser[3]; // 20초동안 유효
      urlStorage[urlto]['active'] = true;
      urlStorage[urlto]['expired'] = false;
      res.end(urlto);
    }
  } else {
    res.statusCode = 405;
    res.setHeader("content-type", "text/html; charset=UTF-8");

    res.end(
      '<meta charset="utf-8"><h1>405 Method Not Allowed</h1>이 서버에서 처리할 수 없는 요청입니다.<br><br><hr><b><center>OGAnime Streaming Server, Version 0.1</center></b>'
    );

  }



}
var server = http.createServer(app);

server.listen(5050);

https.createServer(options, app).listen(443);