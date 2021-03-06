let currentWindow = null;
import MessageService from './message-service';

const eventMap = {
  'auth-requested': 'auth-requested',
  'blur': 'blurred',
  'move': 'bounds-changed',
  'resize': 'bounds-changed',
  'bounds-changing': 'bounds-changing',
  'close': 'close-requested',
  'closed': 'closed',
  'disabled-frame-bounds-changed': 'disabled-frame-bounds-changed',
  'disabled-frame-bounds-changing': 'disabled-frame-bounds-changing',
  'embedded': 'embedded',
  'external-process-exited': 'external-process-exited',
  'external-process-started': 'external-process-started',
  'focus': 'focused',
  'frame-disabled': 'frame-disabled',
  'frame-enabled': 'frame-enabled',
  'group-changed': 'group-changed',
  'hide': 'hidden',
  'initialized': 'initialized',
  'maximize': 'maximized',
  'message': 'message',
  'minimize': 'minimized',
  'navigation-rejected': 'navigation-rejected',
  'restore': 'restored',
  'show-requested': 'show-requested',
  'show': 'shown'
};

const windowStates = {
  MAXIMIZED: 'maximized',
  MINIMIZED: 'minimized',
  RESTORED: 'restored'
};

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

const isUrlPattern = /^https?:\/\//i;

const guid = () => {
  const s4 = () => {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
};

const getDefaultOptions = () => ({
  name: guid(),
  autoShow: true
});

const convertOptions = (options: ssf.WindowOptions) => {
  const frameSize = navigator.appVersion.indexOf('Win') != -1 ? 20 : 25;
  let clonedOptions: any = Object.assign({}, getDefaultOptions(), options);

  const optionsMap = {
    'alwaysOnTop': 'alwaysOnTop',
    'backgroundColor': 'backgroundColor',
    'child': 'child',
    'center': 'defaultCentered',
    'frame': 'frame',
    'hasShadow': 'shadow',
    'height': 'defaultHeight',
    'maxHeight': 'maxHeight',
    'maximizable': 'maximizable',
    'maxWidth': 'maxWidth',
    'minHeight': 'minHeight',
    'minimizable': 'minimizable',
    'minWidth': 'minWidth',
    'resizable': 'resizable',
    'show': 'autoShow',
    'skipTaskbar': 'showTaskbarIcon',
    'transparent': 'opacity',
    'width': 'defaultWidth',
    'x': 'defaultLeft',
    'y': 'defaultTop'
  };

  Object.keys(optionsMap).forEach((optionKey) => {
    const openFinOptionKey = optionsMap[optionKey];
    if (clonedOptions[optionKey] != null) {
      clonedOptions[openFinOptionKey] = clonedOptions[optionKey];
      if (openFinOptionKey !== optionKey) {
        delete clonedOptions[optionKey];
      }
    }
  });

  if (clonedOptions.transparent) {
    // OpenFin needs opacity between 1 (not transparent) and 0 (fully transparent)
    clonedOptions.opacity = clonedOptions.transparent === true ? 0 : 1;
    delete clonedOptions.transparent;
  }

  if (clonedOptions.skipTaskbar) {
    clonedOptions.showTaskbarIcon = !clonedOptions.skipTaskbar;
    delete clonedOptions.skipTaskbar;
  }

  if (clonedOptions.defaultLeft == null || clonedOptions.defaultTop == null) {
    // Electron requires both x and y to be defined else it centers the window even if center is false
    clonedOptions.defaultCentered = true;
  }

  if (clonedOptions.defaultWidth == null) {
    clonedOptions.defaultWidth = DEFAULT_WIDTH;
  }

  if (clonedOptions.defaultHeight == null) {
    clonedOptions.defaultHeight = DEFAULT_HEIGHT;
  }

  if (clonedOptions.maxHeight != null && clonedOptions.frame !== false) {
    clonedOptions.maxHeight += frameSize;
  }

  if (clonedOptions.minHeight != null && clonedOptions.frame !== false) {
    clonedOptions.minHeight += frameSize;
  }

  return clonedOptions;
};

class Window implements ssf.Window {
  children: Array<any>;
  eventListeners: Map<any, any>;
  innerWindow: fin.OpenFinWindow;
  id: string;

  constructor(options: ssf.WindowOptions, callback?: any, errorCallback?: any) {
    this.children = [];

    this.eventListeners = new Map();
    MessageService.subscribe('*', 'ssf-window-message', (...args) => {
      const event = 'message';
      if (this.eventListeners.has(event)) {
        this.eventListeners.get(event).forEach(listener => listener(...args));
      }
    });

    if (!options) {
      this.innerWindow = fin.desktop.Window.getCurrent();
      this.id = `${this.innerWindow.uuid}:${this.innerWindow.name}`;
      if (callback) {
        callback(this);
      }
      return this;
    }

    const openFinOptions = convertOptions(options);

    // Allow relative urls (e.g. /index.html and demo/demo.html)
    if (!isUrlPattern.test(options.url) && openFinOptions.url !== 'about:blank') {
      if (openFinOptions.url.startsWith('/')) {
        // File at root
        openFinOptions.url = location.origin + openFinOptions.url;
      } else {
        // relative to current file
        const pathSections = location.pathname.split('/').filter(x => x);
        pathSections.splice(-1);
        const currentPath = pathSections.join('/');
        openFinOptions.url = location.origin + '/' + currentPath + openFinOptions.url;
      }
    }

    if (openFinOptions.child) {
      const currentWindow = Window.getCurrentWindow();
      currentWindow.children.push(this);
      this.innerWindow = new fin.desktop.Window(openFinOptions, () => {
        this.id = `${this.innerWindow.uuid}:${this.innerWindow.name}`;
        // We want to return our window, not the OpenFin window
        if (callback) {
          callback(this);
        }
      }, errorCallback);
    } else {
      const appOptions = {
        name: openFinOptions.name,
        url: openFinOptions.url,
        uuid: openFinOptions.name, // UUID must be the same as name
        mainWindowOptions: openFinOptions
      };

      const app = new fin.desktop.Application(appOptions, (successObject) => {
        app.run();
        this.innerWindow = app.getWindow();
        this.id = `${this.innerWindow.uuid}:${this.innerWindow.name}`;
        if (callback) {
          callback(this);
        }
      }, errorCallback);
    }
  }

  asPromise<T>(fn, ...args): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.innerWindow) {
        const openFinFunction = this.innerWindow[fn];
        openFinFunction.call(this.innerWindow, ...args, resolve, reject);
      } else {
        reject(new Error('The window does not exist or the window has been closed'));
      }
    });
  }

  blur() {
    return this.asPromise<void>('blur');
  }

  close() {
    return this.asPromise<void>('close', false)
      .then(() => {
        this.innerWindow = undefined;
      });
  }

  flashFrame(flag) {
    if (flag) {
      return this.asPromise<void>('flash', {});
    } else {
      return this.asPromise<void>('stopFlashing');
    }
  }

  focus() {
    return this.asPromise<void>('focus');
  }

  getBounds() {
    return this.asPromise<ssf.Rectangle>('getBounds')
      .then((bounds: any) => ({
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height
      }));
  }

  getChildWindows() {
    return this.children;
  }

  getId() {
    return this.id;
  }

  getMaximumSize() {
    return this.getOptions()
      .then((options: any) => [options.maxWidth, options.maxHeight]);
  }

  getMinimumSize() {
    return this.getOptions()
      .then((options: any) => [options.minWidth, options.minHeight]);
  }

  getOptions() {
    return this.asPromise<any>('getOptions');
  }

  getParentWindow() {
    return new Promise((resolve, reject) => {
      if (this.innerWindow) {
        let parent = null;
        if (window.opener) {
          const win = fin.desktop.Window.wrap(this.innerWindow.uuid, window.opener.name);
          parent = new Window(null, null, null);
          parent.innerWindow = win;
        }

        resolve(parent);
      } else {
        reject(new Error('The window does not exist or the window has been closed'));
      }
    });
  }

  getPosition() {
    return this.getBounds()
      .then((bounds: any) => [bounds.x, bounds.y]);
  }

  getSize() {
    return this.getBounds()
      .then((bounds: any) => [bounds.width, bounds.height]);
  }

  getTitle() {
    return this.getOptions()
      .then((options: any) => options.title);
  }

  getState() {
    return this.asPromise<any>('getState');
  }

  hasShadow() {
    return this.getOptions()
      .then((options: any) => options.shadow);
  }

  hide() {
    return this.asPromise<void>('hide');
  }

  isAlwaysOnTop() {
    return this.getOptions()
      .then((options: any) => options.alwaysOnTop);
  }

  isMaximizable() {
    return this.getOptions()
      .then((options: any) => options.maximizable);
  }

  isMaximized() {
    return this.getState()
      .then((state: any) => state === windowStates.MAXIMIZED);
  }

  isMinimizable() {
    return this.getOptions()
      .then((options: any) => options.minimizable);
  }

  isMinimized() {
    return this.getState()
      .then((state: any) => state === windowStates.MINIMIZED);
  }

  isResizable() {
    return this.getOptions()
      .then((options: any) => options.resizable);
  }

  isVisible() {
    return this.asPromise<boolean>('isShowing');
  }

  loadURL(url) {
    return this.asPromise<void>('executeJavaScript', `window.location = '${url}'`);
  }

  reload() {
    return this.asPromise<void>('reload');
  }

  restore() {
    return this.asPromise<void>('restore');
  }

  setAlwaysOnTop(alwaysOnTop) {
    return this.updateOptions({ alwaysOnTop });
  }

  setBounds(bounds) {
    return this.asPromise<void>('setBounds', bounds.x, bounds.y, bounds.width, bounds.height);
  }

  setIcon(icon) {
    return this.updateOptions({ icon });
  }

  setMaximizable(maximizable) {
    return this.updateOptions({ maximizable });
  }

  setMaximumSize(maxWidth, maxHeight) {
    return this.updateOptions({ maxWidth, maxHeight });
  }

  setMinimizable(minimizable) {
    return this.updateOptions({ minimizable });
  }

  setMinimumSize(minWidth, minHeight) {
    return this.updateOptions({ minWidth, minHeight });
  }

  setPosition(x, y) {
    return this.asPromise<void>('moveTo', x, y);
  }

  setResizable(resizable) {
    return this.updateOptions({ resizable });
  }

  setSize(width, height) {
    return this.asPromise<void>('resizeTo', width, height, 'top-left');
  }

  setSkipTaskbar(skipTaskbar) {
    return this.updateOptions({ showTaskbarIcon: !skipTaskbar });
  }

  show() {
    return this.asPromise<void>('show', false);
  }

  maximize() {
    return this.asPromise<void>('maximize');
  }

  minimize() {
    return this.asPromise<void>('minimize');
  }

  unmaximize() {
    return this.restore();
  }

  updateOptions(options) {
    return this.asPromise<void>('updateOptions', options);
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
        listeners = listeners.splice(index, 1);
        this.eventListeners.set(event, listeners);
      }
    }

    this.innerWindow.removeEventListener(eventMap[event], listener);
  }

  removeAllListeners() {
    this.eventListeners.forEach((value, key) => {
      value.forEach((listener) => {
        this.innerWindow.removeEventListener(key, listener);
      });
    });

    this.eventListeners.clear();
  }

  postMessage(message) {
    MessageService.send(`${this.innerWindow.uuid}:${this.innerWindow.name}`, 'ssf-window-message', message);
  }

  static getCurrentWindow(callback?: any, errorCallback?: any) {
    if (currentWindow) {
      return currentWindow;
    }

    currentWindow = new Window(null, callback, errorCallback);
    return currentWindow;
  }
}

export default Window;
