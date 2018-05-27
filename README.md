# compile
```
node-gyp rebuild

```

# execute
run example
```
node ./example/ctpapp.js

```

# Example
请参看example目录下示例
```
const CtpClass = require('../index').Ctp;
const Market = require('./mymarket');
const Trade = require('./mytrade');

let ctp = new CtpClass(
    {
        frontend: {
           	BrokerID: '4040',// 银河期货
           	MdURL: 'tcp://180.166.103.21:51213',
           	TdURL: 'tcp://180.166.103.21:51205'
        }
    },
    {
        InvestorID: '0060000123',
        Password: '123456',
        FundPassword: '123456'
    }
);

ctp.createMdApi();
ctp.createTdApi();

new Market(ctp);
new Trade(
    ctp,
    {
        privateTopicMode: 0,
        publicTopicModel: 0
    }
);

ctp.registerMdFront();
ctp.registerTdFront();

let { md, td } = ctp;
// 调用交易相关接口, 具体有哪些接口请参看CTP文档
td.ReqXXXXXX();
// 调用行情相关接口, 具体有哪些接口请参看CTP文档
md.ReqXXXXXX();
```