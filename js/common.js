'use strict';

const KEY_PREFIX = 'autodark';

const AUTOMATIC_SUNTIMES_KEY = KEY_PREFIX + "automaticSuntimes";
const CHECK_TIME_STARTUP_ONLY_KEY = KEY_PREFIX + "checkTimeStartupOnly";
const DAYTIME_THEME_KEY = KEY_PREFIX + "daytimeTheme";
const NIGHTTIME_THEME_KEY = KEY_PREFIX + "nighttimeTheme";
const SUNRISE_TIME_KEY = KEY_PREFIX + "sunriseTime";
const SUNSET_TIME_KEY = KEY_PREFIX + "sunsetTime";
const NEXT_SUNRISE_ALARM_NAME = KEY_PREFIX + "nextSunrise";
const NEXT_SUNSET_ALARM_NAME = KEY_PREFIX + "nextSunset";

const DEFAULT_AUTOMATIC_SUNTIMES = false;
const DEFAULT_CHECK_TIME_STARTUP_ONLY = false;
const DEFAULT_SUNRISE_TIME = "08:00";
const DEFAULT_SUNSET_TIME = "20:00";

// Default themes are set after looking through the user's
// current theme and their installed themes.
let DEFAULT_DAYTIME_THEME = "";
let DEFAULT_NIGHTTIME_THEME = "";

// Things to do when the extension is starting up
// (or if the settings have been reset).
function init() {
    // console.log("automaticDark DEBUG: Starting up automaticDark");

    // Set values if they each have never been set before,
    // such as on first-time startup.
    return setStorage({
            [AUTOMATIC_SUNTIMES_KEY]: {check: DEFAULT_AUTOMATIC_SUNTIMES},
            [CHECK_TIME_STARTUP_ONLY_KEY]: {check: DEFAULT_CHECK_TIME_STARTUP_ONLY},
            [SUNRISE_TIME_KEY]: {time: DEFAULT_SUNRISE_TIME},
            [SUNSET_TIME_KEY]: {time: DEFAULT_SUNSET_TIME}
        })
        .then(() => {
            // Check the user's themes and check the default daytime and
            // nighttime themes based on this.
            return setDefaultThemes();
        }, onError)
        .then(() => {
            return setStorage({
                [DAYTIME_THEME_KEY]: {themeId: DEFAULT_DAYTIME_THEME},
                [NIGHTTIME_THEME_KEY]: {themeId: DEFAULT_NIGHTTIME_THEME}
            });
        }, onError)
        .then(() => {
            // On start up, check the time to see what theme to show.
            checkTime();

            // If flag is not set to check only on startup,
            // create alarms to change the theme in the future.
            browser.alarms.onAlarm.addListener(alarmListener);
            return browser.storage.local.get([CHECK_TIME_STARTUP_ONLY_KEY]);
        }, onError)
        .then((obj) => {
            if (obj.hasOwnProperty(CHECK_TIME_STARTUP_ONLY_KEY)) { // This may not be necessary
                if (!obj[CHECK_TIME_STARTUP_ONLY_KEY].check) {

                    // Every time the window is focused, check the time and reset the alarms.
                    // This prevents any delay in the alarms after OS sleep/hibernation.
                    browser.windows.onFocusChanged.addListener((windowId) => {
                        if (windowId !== browser.windows.WINDOW_ID_NONE) {
                            checkTime();
                            browser.alarms.clearAll();
                            createDailyAlarm(SUNRISE_TIME_KEY, NEXT_SUNRISE_ALARM_NAME),
                            createDailyAlarm(SUNSET_TIME_KEY, NEXT_SUNSET_ALARM_NAME)
                        }
                    });

                    return Promise.all([
                            createDailyAlarm(SUNRISE_TIME_KEY, NEXT_SUNRISE_ALARM_NAME),
                            createDailyAlarm(SUNSET_TIME_KEY, NEXT_SUNSET_ALARM_NAME)
                        ]);
                }
            }
        }, onError);
}

// Creates an alarm based on a key used to get 
// a String in the 24h format 
// "HH:MM" and an alarm name.
function createDailyAlarm(timeKey, alarmName) {
    return browser.storage.local.get([
            CHECK_TIME_STARTUP_ONLY_KEY,
            timeKey
        ])
        .then((obj) => {
            let timeSplit = obj[timeKey].time.split(":");

            const when = convertToNextMilliEpoch(timeSplit[0], timeSplit[1]);
            const periodInMinutes = 60 * 24;
            return browser.alarms.create(alarmName, {
                when,
                periodInMinutes
            })
         }, onError)
        .then(() => {
            //logAllAlarms();
        }, onError);
}

// Depending on the alarm name passed, this listener will:
// - Get the stored daytime/nighttime theme and 
//   try to enable theme.
// - Check the time and change the theme accordingly.
function alarmListener(alarmInfo) {
    if (alarmInfo.name === NEXT_SUNRISE_ALARM_NAME) {
        return browser.storage.local.get(DAYTIME_THEME_KEY)
            .then(enableTheme, onError);
    }
    else if (alarmInfo.name === NEXT_SUNSET_ALARM_NAME) {
        return browser.storage.local.get(NIGHTTIME_THEME_KEY)
            .then(enableTheme, onError);
    }
    else if (alarmInfo.name === "checkTime") {
        return checkTime();
    }
}

// Check the current system time and set the theme based on the time.
// Will set the daytime theme between sunrise and sunset.
// Otherwise, set nighttime theme.

// Can split this function to be more generic. Make function enableTime happen as a parameter.
function checkTime() {
    let date = new Date(Date.now());
    let hours = date.getHours();
    let minutes = date.getMinutes();
    //console.log("It is currently: " + hours + ":" + minutes + ". Conducting time check now...");

    return browser.storage.local.get([SUNRISE_TIME_KEY, SUNSET_TIME_KEY])
        .then((obj) => {
            let sunriseSplit = obj[SUNRISE_TIME_KEY].time.split(":");
            let sunsetSplit = obj[SUNSET_TIME_KEY].time.split(":");

            if (timeInBetween(
                    hours, minutes, 
                    sunriseSplit[0], sunriseSplit[1], 
                    sunsetSplit[0], sunsetSplit[1])) {
                browser.storage.local.get(DAYTIME_THEME_KEY)
                    .then(enableTheme, onError);
            } else {
                browser.storage.local.get(NIGHTTIME_THEME_KEY)
                    .then(enableTheme, onError);
            }

        }, onError);
}

// Parse the object given and enable the theme.if it is not
// already enabled.
function enableTheme(theme) {
    theme = theme[Object.keys(theme)[0]];
    return browser.management.get(theme.themeId)
        .then((extInfo) => {
            if (!extInfo.enabled) {
                //console.log("automaticDark DEBUG: Enabled theme " + theme.themeId);
                browser.management.setEnabled(theme.themeId, true);
            }
        }, onError);
}

// Take in the time as hours and minutes and
// return the next time it will occur as
// milliseconds since the epoch.
function convertToNextMilliEpoch(hours, minutes) {
    let returnDate = new Date(Date.now());
    returnDate.setHours(hours);
    returnDate.setMinutes(minutes);
    returnDate.setSeconds(0);
    returnDate.setMilliseconds(0);

    // If the specified time has already occurred, 
    // the next time it will occur will be the next day.
    if (returnDate < Date.now()) {
        returnDate.setDate(returnDate.getDate() + 1);
    }
    return returnDate.getTime();
}

// Set the currently enabled theme
// as the default daytime/nighttime theme.
//
// Set default nighttime theme to Firefox's
// default if it is available.
function setDefaultThemes() {
    // Iterate through each theme.
    return browser.management.getAll()
        .then((extensions) => {
            for (let extension of extensions) {
                if (extension.type === 'theme') {
                    if (extension.enabled) {
                        DEFAULT_DAYTIME_THEME = extension.id;
                        DEFAULT_NIGHTTIME_THEME = extension.id;
                    }

                    // If the theme is Firefox's default dark theme,
                    // set the default nighttime theme to it.
                    if (extension.id === "firefox-compact-dark@mozilla.org") {
                        DEFAULT_NIGHTTIME_THEME = extension.id;
                    }
                }
            }
        })
}



function getSuntimesFromGeolocation() {
    if (!navigator.geolocation) {
        console.log('Geolocation is not supported by your browser');
    } else {
        console.log('Locating…');
        navigator.geolocation.getCurrentPosition(() => {
            const latitude  = position.coords.latitude;
            const longitude = position.coords.longitude;

            return SunCalc.getTimes(Date.now(), latitude, longitude);
        }, () => {
            console.log("Unable to fetch current location.");
        });
    }
}