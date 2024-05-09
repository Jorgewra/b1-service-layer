import axios from 'axios';
import dayjs from 'dayjs';
import * as https from "https";
/**
 *  @param {number}  Port     - your porte in the server SAP for API SL
 *  @param {String}  version  - your version API in the SL
 *  @param {boolean} debug    - if your project is debug
 *  @param {String}  host     - your Host server SAP
 *  @param {String}  company  - your DB Company for SAP
 *  @param {String}  password - your password for SAP
 *  @param {String}  username - your user for SAP
 */
type ConfigProp = {
  port: number;
  version: string;
  debug: boolean;
  host:string;
  company: string;
  password: string;
  username: string;
};

class ServiceLayer {
  private instance: any = null;
  private sessionTimeout = 0;
  private startSessionTime:any = null;
  private endSessionTime:any = null;
  private config: ConfigProp;
  /**
   * Represents the constructor of the B1ServiceLayer class.
   * @constructor
   */
  constructor() {
    this.config = {
      port: 80,
      version: 'v2',
      debug: false,
      host:"http://localhost",
      company:"",
      password:"",
      username:"",        
    };
  }

  /**
   * Create a new session
   * config object: {host, company, password, username}
   */
  async createSession(config: ConfigProp) {
    this.config = config = { ...this.config, ...config };
    if (config.debug) {
      console.log('Config parameters', this.config);
    }
    axios.defaults.withCredentials = true;
    
    if (config.host.slice(-1) === '/') {
      config.host = config.host.substring(0, config.host.length - 1);
    }

    this.instance = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      }),  
      validateStatus: function (status) {
        return ((status >= 200 && status < 300) || status === 405); // default
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      baseURL: `${config.host}:${config.port}/b1s/${config.version}/`
    });
    const result = await this.instance.post('Login', {
      CompanyDB: config.company,
      Password: config.password,
      UserName: config.username
    });

    this.instance.defaults.headers.common.Cookie = `B1SESSION=${result.data.SessionId};CompanyDB=${config.company}`;
    if (this.config.debug) {
      console.log(this.instance.defaults.headers.common.Cookie);
    }

    this.sessionTimeout = result.data.SessionTimeout;
    this.startSessionTime = dayjs();
    this.endSessionTime = this.startSessionTime.add(this.sessionTimeout - 1, 'minute');
    if (this.config.debug) {
      console.log(`Session Timeout: ${this.sessionTimeout}`);
      console.log(`Start Session Time: ${this.startSessionTime}`);
      console.log(`End Session Time: ${this.endSessionTime}`);
    }
    
  }

  /**
   * Refresh session if expired
   */
  async refreshSession() {
    const now = dayjs();
    if (now.isAfter(this.endSessionTime)) {
      if (this.config.debug) {
        console.warn('The session is expired. Refreshing...');
      }
      await this.createSession(this.config);
    }
  }

  /**
   * Simple service layer query (GET Method)
   * @param {String} q - The query string.
   * @param {Object} options - Axios options object.
   * @returns {Promise<Array>} - A promise that resolves to an array of records.
   */
  async query(q:string, options:any = {}) {
    await this.refreshSession();
    const result = await this.instance.get(q, options);
    return result.data;
  }

  /**
   * Finds records based on the provided query and options.
   * @param {String} query - The query string.
   * @param {Object} options - Axios options object.
   * @returns {Promise<Array>} - A promise that resolves to an array of records.
   * (eg: ProductionOrders?$select=AbsoluteEntry, DocumentNumber)
   */
  async find(query:string, options:any = {}) {
    await this.refreshSession();

    let result:any = [];
    let request = await this.query(query);
    result = result.concat(request.value);

    if (request['@odata.nextLink']) {
      request = await this.query(request['@odata.nextLink'], options);
      result = result.concat(request.value);

      while (request['@odata.nextLink']) {
        request = await this.query(request['@odata.nextLink'], options);
        result = result.concat(request.value);
      }
    }
    return result;
  }

  /**
   * Get Resource (eg Orders(10))
   * @param {String} resource - The resource string.
   * @param {Object} options - Axios options object.
   * @returns {Promise<Array>} - A promise that resolves to an array of records.
   */
  async get(resource:string, options:any = {}) {
    try {
      await this.refreshSession();
      const result = await this.instance.get(resource, options);
      return result.data;
    } catch (error:any) {
      return this.parseError(error);
    }
  }

  /**
   * Update Resource
   * @param {String} resource - The resource string.
   * @param {Object} data - Axios options object.
   * @returns {Promise<Array>} - A promise that resolves to an array of records.
   */
  async put(resource:string, data:any) {
    try {
      await this.refreshSession();
      const result = await this.instance.put(resource, data);
      return result.data;
    } catch (error:any) {
      return this.parseError(error);
    }
  }

  /**
   * Update Resource partially
   */
  async patch(resource:string, data:any) {
    try {
      await this.refreshSession();
      const result = await this.instance.patch(resource, data);
      return result.data;
    } catch (error:any) {
      return this.parseError(error);
    }
  }

  /**
   * Create resource
   */
  async post(resource:string, data:any) {
    try {
      await this.refreshSession();
      const result = await this.instance.post(resource, data);
      return result.data;
    } catch (error:any) {
      return this.parseError(error);
    }
  }

  /**
   * Parse error message
   */

  parseError({ response, request, message }:any) {
    if (response) {
      console.error('🟥 \x1b[31m%s\x1b[0m', 'ERROR RESPONSE SERVICE LAYER');
      console.error('%s: \x1b[36m%s\x1b[0m', 'URL', request.path);
      console.error('Status: \x1b[33m%s\x1b[0m - %s', response.status, response.statusText);
      console.error('Data:', response.data);
      console.error('Headers:', response.headers);
      return { error: true, message: response.data };
    }
    if (request) {
      console.error('🟥 \x1b[31m%s\x1b[0m', 'ERROR REQUEST');
      console.error('%s: \x1b[36m%s\x1b[0m', 'URL', request.path);
      return { error: true, message: 'ERROR REQUEST' };
    }
    // Something happened in setting up the request and triggered an Error
    console.error('Error', message);
    return { error: true, message: message };
  }
}

function ServiceLayerFactory() {
  return new ServiceLayer();
}

export default ServiceLayerFactory();
