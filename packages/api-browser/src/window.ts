import {
  addAccessibleWindow,
  removeAccessibleWindow
} from './accessible-windows';

let currentWindow = null;

const getWindowOffsets = (win) => {
    var xOffset = (win.outerWidth / 2);
    var yOffset = (win.outerHeight / 2);
    return [Math.floor(xOffset), Math.floor(yOffset)];
}

class Window implements ssf.WindowCore {
  children: any;
  innerWindow: any;
  eventListeners: any;
  id: string;

  constructor(options, callback?, errorCallback?) {
    this.children = [];

    this.eventListeners = new Map();

    if (!options) {
      this.innerWindow = window;
      this.id = window.name;
      if (callback) {
        callback(this);
      }
    } else {
      this.innerWindow = window.open(options.url, options.name, objectToFeaturesString(options));
      this.id = this.innerWindow.name;
      const [xOffset, yOffset] = getWindowOffsets(this.innerWindow);
      this.setPosition(options.x || (screen.width / 2) - xOffset, options.y || (screen.height / 2) - yOffset);
      this.innerWindow.onclose = () => {
        removeAccessibleWindow(this.innerWindow.name);
      };

      const currentWindow = Window.getCurrentWindow();
      currentWindow.children.push(this);
      addAccessibleWindow(options.name, this.innerWindow);
    }

    this.addListener('message', (e) => {
      const event = 'message';
      if (this.eventListeners.has(event)) {
        this.eventListeners.get(event).forEach(listener => listener(e.data));
      }
    });

    if (callback) {
      callback(this);
    }
  }

  close() {
    return this.asPromise<void>(() => this.innerWindow.close());
  }

  getId() {
    return this.id;
  }

  focus() {
    return this.asPromise<void>(() => this.innerWindow.focus());
  }

  blur() {
    return this.asPromise<void>(() => this.innerWindow.blur());
  }

  getBounds() {
    return this.asPromise<ssf.Rectangle>(() => ({
      x: this.innerWindow.screenX,
      y: this.innerWindow.screenY,
      width: this.innerWindow.outerWidth,
      height: this.innerWindow.outerHeight
    }));
  }

  getParentWindow() {
    return new Promise(resolve => {
      let newWin = null;
      if (window.opener) {
        newWin = new Window(null);
        newWin.innerWindow = window.opener;
        newWin.id = window.opener.name;
      }

      resolve(newWin);
    });
  }

  getPosition() {
    return this.asPromise<ReadonlyArray<number>>(() => [this.innerWindow.screenX, this.innerWindow.screenY]);
  }

  getSize() {
    return this.asPromise<ReadonlyArray<number>>(() => [this.innerWindow.outerWidth, this.innerWindow.outerHeight]);
  }

  getTitle() {
    return this.asPromise<string>(() => this.innerWindow.name || this.innerWindow.document.title);
  }

  // Cannot be anything but true for browser
  isMaximizable() {
    return this.asPromise<boolean>(() => true);
  }

  // Cannot be anything but true for browser
  isMinimizable() {
    return this.asPromise<boolean>(() => true);
  }

  // Cannot be anything but true for browser
  isResizable() {
    return this.asPromise<boolean>(() => true);
  }

  loadURL(url) {
    return this.asPromise<void>(() => location.href = url);
  }

  reload() {
    return this.asPromise<void>(() => location.reload());
  }

  setBounds(bounds) {
    return this.asPromise<void>(() => {
      this.innerWindow.moveTo(bounds.x, bounds.y);
      this.innerWindow.resizeTo(bounds.width, bounds.height);
    });
  }

  setPosition(x, y) {
    return this.asPromise<void>(() => this.innerWindow.moveTo(x, y));
  }

  setSize(width, height) {
     return this.asPromise<void>(() => this.innerWindow.resizeTo(width, height));
  }

  addListener(event, listener) {
    if (this.eventListeners.has(event)) {
      const temp = this.eventListeners.get(event);
      temp.push(listener);
      this.eventListeners.set(event, temp);
    } else {
      this.eventListeners.set(event, [listener]);
    }
    this.innerWindow.addEventListener(eventMap[event], listener);
  }

  removeListener(event, listener) {
    if (this.eventListeners.has(event)) {
      let listeners = this.eventListeners.get(event);
      let index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
        this.eventListeners.set(listeners);
      }
    }

    this.innerWindow.removeEventListener(eventMap[event], listener);
  }

  removeAllListeners() {
    this.eventListeners.forEach((value, key) => {
      value.forEach((listener) => {
        this.innerWindow.removeEventListener(eventMap[key], listener);
      });
    });

    this.eventListeners.clear();
  }

  postMessage(message) {
    this.innerWindow.postMessage(message, '*');
  }

  getChildWindows() {
    return this.children;
  }

  asPromise<T>(fn): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.innerWindow) {
        resolve(fn());
      } else {
        reject(new Error('The window does not exist or the window has been closed'));
      }
    });
  }

  static getCurrentWindow(callback?: any, errorCallback?: any) {
    if (currentWindow) {
      return currentWindow;
    }

    currentWindow = new Window(null, callback, errorCallback);
    return currentWindow;
  }
}

const objectToFeaturesString = (features) => {
  return Object.keys(features).map((key) => {
    let value = features[key];

    // Need to convert booleans to yes/no
    if (value === true) {
      value = 'yes';
    } else if (value === false) {
      value = 'no';
    }

    return `${key}=${value}`;
  }).join(',');
};

const eventMap = {
  'blur': 'blur',
  'close': 'beforeunload',
  'closed': 'unload',
  'focus': 'focus',
  'hide': 'hidden',
  'message': 'message',
  'show': 'load'
};

export default Window;
