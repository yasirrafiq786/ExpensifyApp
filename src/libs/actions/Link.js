import lodashGet from 'lodash/get';
import Onyx from 'react-native-onyx';
import _ from 'underscore';
import * as API from '@libs/API';
import asyncOpenURL from '@libs/asyncOpenURL';
import * as Environment from '@libs/Environment/Environment';
import Navigation from '@libs/Navigation/Navigation';
import * as Url from '@libs/Url';
import CONFIG from '@src/CONFIG';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';

let isNetworkOffline = false;
Onyx.connect({
    key: ONYXKEYS.NETWORK,
    callback: (val) => (isNetworkOffline = lodashGet(val, 'isOffline', false)),
});

let currentUserEmail;
Onyx.connect({
    key: ONYXKEYS.SESSION,
    callback: (val) => (currentUserEmail = lodashGet(val, 'email', '')),
});

/**
 * @param {String} [url] the url path
 * @param {String} [shortLivedAuthToken]
 *
 * @returns {Promise<string>}
 */
function buildOldDotURL(url, shortLivedAuthToken) {
    const hasHashParams = url.indexOf('#') !== -1;
    const hasURLParams = url.indexOf('?') !== -1;

    const authTokenParam = shortLivedAuthToken ? `authToken=${shortLivedAuthToken}` : '';
    const emailParam = `email=${encodeURIComponent(currentUserEmail)}`;

    const params = _.compact([authTokenParam, emailParam]).join('&');

    return Environment.getOldDotEnvironmentURL().then((environmentURL) => {
        const oldDotDomain = Url.addTrailingForwardSlash(environmentURL);

        // If the URL contains # or ?, we can assume they don't need to have the `?` token to start listing url parameters.
        return `${oldDotDomain}${url}${hasHashParams || hasURLParams ? '&' : '?'}${params}`;
    });
}

/**
 * @param {String} url
 * @param {Boolean} shouldSkipCustomSafariLogic When true, we will use `Linking.openURL` even if the browser is Safari.
 */
function openExternalLink(url, shouldSkipCustomSafariLogic = false) {
    asyncOpenURL(Promise.resolve(), url, shouldSkipCustomSafariLogic);
}

/**
 * @param {String} url the url path
 */
function openOldDotLink(url) {
    if (isNetworkOffline) {
        buildOldDotURL(url).then((oldDotURL) => openExternalLink(oldDotURL));
        return;
    }

    // If shortLivedAuthToken is not accessible, fallback to opening the link without the token.
    asyncOpenURL(
        // eslint-disable-next-line rulesdir/no-api-side-effects-method
        API.makeRequestWithSideEffects('OpenOldDotLink', {}, {})
            .then((response) => buildOldDotURL(url, response.shortLivedAuthToken))
            .catch(() => buildOldDotURL(url)),
        (oldDotURL) => oldDotURL,
    );
}

/**
 * @param {string} href
 * @returns {string}
 */
function getInternalNewExpensifyPath(href) {
    const attrPath = Url.getPathFromURL(href);
    return (Url.hasSameExpensifyOrigin(href, CONST.NEW_EXPENSIFY_URL) || Url.hasSameExpensifyOrigin(href, CONST.STAGING_NEW_EXPENSIFY_URL) || href.startsWith(CONST.DEV_NEW_EXPENSIFY_URL)) &&
        !CONST.PATHS_TO_TREAT_AS_EXTERNAL.includes(attrPath)
        ? attrPath
        : '';
}

/**
 * @param {string} href
 * @returns {string}
 */
function getInternalExpensifyPath(href) {
    const attrPath = Url.getPathFromURL(href);
    const hasExpensifyOrigin = Url.hasSameExpensifyOrigin(href, CONFIG.EXPENSIFY.EXPENSIFY_URL) || Url.hasSameExpensifyOrigin(href, CONFIG.EXPENSIFY.STAGING_API_ROOT);
    return hasExpensifyOrigin && !attrPath.startsWith(CONFIG.EXPENSIFY.CONCIERGE_URL_PATHNAME) && !attrPath.startsWith(CONFIG.EXPENSIFY.DEVPORTAL_URL_PATHNAME) && attrPath;
}

/**
 * @param {string} href
 * @param {string} environmentURL
 * @param {boolean} [isAttachment]
 */
function openLink(href, environmentURL, isAttachment = false) {
    const hasSameOrigin = Url.hasSameExpensifyOrigin(href, environmentURL);
    const hasExpensifyOrigin = Url.hasSameExpensifyOrigin(href, CONFIG.EXPENSIFY.EXPENSIFY_URL) || Url.hasSameExpensifyOrigin(href, CONFIG.EXPENSIFY.STAGING_API_ROOT);
    const internalNewExpensifyPath = getInternalNewExpensifyPath(href);
    const internalExpensifyPath = getInternalExpensifyPath(href);

    // There can be messages from Concierge with links to specific NewDot reports. Those URLs look like this:
    // https://www.expensify.com.dev/newdotreport?reportID=3429600449838908 and they have a target="_blank" attribute. This is so that when a user is on OldDot,
    // clicking on the link will open the chat in NewDot. However, when a user is in NewDot and clicks on the concierge link, the link needs to be handled differently.
    // Normally, the link would be sent to Link.openOldDotLink() and opened in a new tab, and that's jarring to the user. Since the intention is to link to a specific NewDot chat,
    // the reportID is extracted from the URL and then opened as an internal link, taking the user straight to the chat in the same tab.
    if (hasExpensifyOrigin && href.indexOf('newdotreport?reportID=') > -1) {
        const reportID = href.split('newdotreport?reportID=').pop();
        const reportRoute = ROUTES.REPORT_WITH_ID.getRoute(reportID);
        Navigation.navigate(reportRoute);
        return;
    }

    // If we are handling a New Expensify link then we will assume this should be opened by the app internally. This ensures that the links are opened internally via react-navigation
    // instead of in a new tab or with a page refresh (which is the default behavior of an anchor tag)
    if (internalNewExpensifyPath && hasSameOrigin) {
        Navigation.navigate(internalNewExpensifyPath);
        return;
    }

    // If we are handling an old dot Expensify link we need to open it with openOldDotLink() so we can navigate to it with the user already logged in.
    // As attachments also use expensify.com we don't want it working the same as links.
    if (internalExpensifyPath && !isAttachment) {
        openOldDotLink(internalExpensifyPath);
        return;
    }

    openExternalLink(href);
}

export {buildOldDotURL, openOldDotLink, openExternalLink, openLink, getInternalNewExpensifyPath, getInternalExpensifyPath};
