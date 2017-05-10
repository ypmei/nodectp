
/**
 * 进一步封装ctp
 * 需确保每个ctp类的实例运行在一个单独的进程里, 并且传入的每个setting里的accountMap所有账户同属于一家期货公司
 * 如若需要在同一个程序里使用不同期货公司的账户, 需针对每一家期货公司的账户在不同进程里初始化多个ctp类实例
 * 可使用pm2进程管理工具, 多次调用node yourprogramfile.js
 */

const fd = require('./fd');
const path = require('path');

const object = require('7hoo/object');
const lang = require('7hoo/lang');

const logger = require('./logger').ctpapp;

const shifctp = require('bindings')('shifctp');

function Ctp() {
	this.defaultSetting = {
		flowpath: './con',
		frontend: {
	 		BrokerID: '4040',// 银河期货
	 		MdURL: 'tcp://180.166.103.21:51213',
	 		TdURL: 'tcp://180.166.103.21:51205'
 		},
 		// 默认亏损提醒位列表
 		defaultRemindLossList: [// 亏损时提醒位列表 (停机位也会发起提醒, 并在提醒之后出金改密)
			{
				at: 500,// 亏损到多少时提醒
				type: 'fund'
			},
			{
				at: 1000,
				type: 'fund'
			}
		],
 		accountMap: {}
	};

	this.md = null;
	this.td = null;
}

(function() {

	var nRequestID = parseInt(new Date().getTime() / 1000);

	var sliceProto = Array.prototype.slice;

	/**
	 * @param setting {Object}  之所以很多key用的是首字母大写, 是为了对应ctp c++接口的数据类型字段
	 * {
	 *		flowpath: './con',// 流文件存放目录
	 *		frontend: {
	 *			BrokerID: '4040',// 银河期货
	 *		  MdURL: 'tcp://180.166.103.21:51213',
	 *		  TdURL: 'tcp://180.166.103.21:51205'
	 *		},
	 *		// 默认亏损提醒位列表
	 *		defaultRemindLossList: [// 亏损时提醒位列表 (停机位也会发起提醒, 并在提醒之后出金改密)
	 *			{
	 *				at: 500,// 亏损到多少时提醒
	 *				type: 'fund' || 'percent'
	 *			},
	 *			{
	 *				at: 1000,
	 *				type: 'fund' || 'percent'
	 *			}
	 *		],
	 *		accountMap: {
	 *			369888: {
	 *				UserID: '369888',
	 *				Password: '123456',
	 *				Trader: '李大大',// 交易员的名称
	 *				Email: '383523223@qq.com',// 接收邮件通知的邮箱
	 *				StopAtLoss: 2000 || 0.05,// 停机位
	 *				StopType: 'fund' || 'percent',// 停机位的类型, 按亏损金额或亏损比例
	 *				RemindLossList: [// 亏损时提醒位列 (停机位也会发起提醒, 并在提醒之后出金改密)
	 *		  		{
	 *		  			at: 500,// 亏损到多少时提醒
	 *		  			type: 'fund' || 'percent'
	 *		  		},
	 *		  		{
	 *		  			at: 1000,
	 *		  			type: 'fund' || 'percent'
	 *		  		}
	 *		  	]
	 *			}
	 *		}
	 * }
	 */
	this.init = function(setting) {
		var clonedDefaultSetting = object.clone(this.defaultSetting, true);
		this.setting = object.cover(clonedDefaultSetting, setting || {});
		var brokerID = this.setting.frontend.BrokerID;
		
		// 为account添加BrokerID和InvestorID, 方便后续接口直接把account作为参数传入
		object.forEach(this.setting.accountMap, function(account) {
			account.BrokerID = brokerID;
			account.InvestorID = account.UserID;
		});

		this.setting.flowpath = this.setting.flowpath || './con';
		
		fd.ensureDirectory(this.setting.flowpath);

		this.md = createmd();
		this.td = createtd();
	};	

	this.createMdApi = function(userID) {
		var brokerID = this.setting.frontend.BrokerID;
		var mdFlowpath = path.join(this.setting.flowpath, brokerID + '-' + userID + '-' + 'md', '/');
		fd.ensureDirectory(mdFlowpath);
		this.md.CreateFtdcMdApi(mdFlowpath);
	};

	this.createTdApi = function(userID) {
		var brokerID = this.setting.frontend.BrokerID;
		var tdFlowpath = path.join(this.setting.flowpath, brokerID + '-' + userID + '-' + 'td', '/');
		fd.ensureDirectory(tdFlowpath);
		this.td.CreateFtdcTraderApi(tdFlowpath);
	};

	this.createMdList = function() {
		var me = this;
		object.forEach(this.setting.accountMap, function(account) {
			me.createMdApi(account.UserID);
		});
	};

	this.createTdList = function() {
		var me = this;
		object.forEach(this.setting.accountMap, function(account) {
			me.createTdApi(account.UserID);
		});
	};

	/**
	 * @param config {Object} 配置RegisterFront项
	 * {
	 *		md: true,
	 *		td: true
	 * }
	 */
	this.registerFront = function(config) {
		// 注册mduser
		if (config.md) {
			this.registerMdFront();
		}
		// 注册tduser
		if (config.td) {
			this.registerTdFront();
		}
	};

	this.registerMdFront = function() {
		this.md.RegisterFront(this.setting.frontend.MdURL);
		this.md.Init();
	};

	this.registerTdFront = function() {
		this.td.RegisterFront(this.setting.frontend.TdURL);
		this.td.Init();
	};

	// this.market = function(methodName) {
	// 	this.md[methodName].apply(this.md, sliceProto.call(arguments, 1));
	// };

	// this.trade = function(methodName) {
	// 	this.td[methodName].apply(this.td, sliceProto.call(arguments, 1));
	// };

	this.getAccountByUserID = function(userID) {
		return this.setting.accountMap[userID];
	};

	this.getAddonPath = function() {
		return shifctp.path;
	};

	this.nRequestID = function() {
		return nRequestID++;
	};

	function createmd() {
		return shifctp.crmd();
	}

	function createtd() {
		return shifctp.crtd();
	}

}).call(Ctp.prototype);

module.exports = Ctp;