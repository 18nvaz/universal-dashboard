import React from 'react';

import {
    Route,
    Redirect
} from 'react-router-dom'
import {getApiPath} from 'config';
import UdPage from './ud-page.jsx';
import UdNavbar from './ud-navbar.jsx';
import UdFooter from './ud-footer.jsx';
import Loading from './ud-loading.jsx';
import PageCycler from './page-cycler.jsx';
import ErrorCard from './error-card.jsx';
import {fetchGet} from './services/fetch-service.jsx';
import PubSub from 'pubsub-js';
import { HubConnection } from '@aspnet/signalr-client/dist/browser/signalr-clientES5-1.0.0-alpha2-final.min.js';
import UdModal from './ud-modal.jsx';

export default class UdDashboard extends React.Component {
    constructor() {
        super();

        this.state = {
            dashboard: null,
            hasError: false,
            error: null,
            pausePageCycle: false,
            redirectToLogin: false,
            loading: true,
            location: null,
            authenticated: false,
            sessionId: ''
        }
    }

    connectWebSocket() {
        let connection = new HubConnection(getApiPath() + '/dashboardhub');

        connection.on('reload', data => {
            window.location.reload(true);
        });

        connection.on('getSessionId', function(data) {
            connection.invoke("setSessionId", this.state.sessionId)
        }.bind(this));

        connection.on('setState', (componentId, state) => {
            PubSub.publish(componentId, {
                type: "setState",
                state: state
            });
        });

        connection.on('sendToast', (message, duration) => {
            Materialize.toast(message, duration);
        });

        connection.on('requestState', (componentId, requestId) => {
            PubSub.publish(componentId, {
                type: "requestState",
                requestId: requestId
            });
        });

        connection.on('removeElement', (componentId) => {
            PubSub.publish(componentId, {
                type: "removeElement",
                componentId: componentId
            });
        });

        connection.on('clearElement', (componentId) => {
            PubSub.publish(componentId, {
                type: "clearElement",
                componentId: componentId
            });
        });

        connection.on('syncElement', (componentId) => {
            PubSub.publish(componentId, {
                type: "syncElement",
                componentId: componentId
            });
        });

        connection.on('addElement', (componentId, elements) => {
            PubSub.publish(componentId, {
                type: "addElement",
                componentId: componentId,
                elements: elements
            });
        });

        connection.on('showModal', (props) => {
            PubSub.publish("modal.open", props);
        });

        connection.on('closeModal', () => {
            PubSub.publish("modal.close", {});
        });

        connection.on('redirect', (url) => {
            window.location.href = url;
        });

        PubSub.subscribe('element-event', function(e, data) {
            if (data.type === "requestStateResponse") {
                connection.invoke("requestStateResponse", data.requestId, data.state)
            }

            if (data.type === "clientEvent") {
                connection.invoke("clientEvent", data.componentId, data.eventName, data.eventData, this.state.location)
            }

            if (data.type === "unregisterEvent") {
                connection.invoke("unregisterEvent", data.eventId)
            }
        }.bind(this));

        connection.start();

        this.connection = connection;
        window.UniversalDashboard.webSocket = connection;
    }

    componentDidUpdate() {
        if (this.connection != null) {
            this.connection.invoke("setSessionId", this.state.sessionId);
        }
    }

    componentWillMount() {
        this.loadData();
    }

    relayEvent(json) {
        var events = JSON.parse(json);

        events.map(function(event) {
            PubSub.publish(event.id, event);
        })
    }

    componentDidCatch(error, info) {
        this.setState({ hasError: true, error: error });
    }

    togglePausePageCycle() {
        this.setState({
            pausePageCycle: !this.state.pausePageCycle
        })
    }

    loadStylesheet(url) {
        var styles = document.createElement('link');
        styles.rel = 'stylesheet';
        styles.type = 'text/css';
        styles.media = 'screen';
        styles.href = url;
        document.getElementsByTagName('head')[0].appendChild(styles);
    }

    loadJavascript(url) {
        var jsElm = document.createElement("script");
        jsElm.type = "application/javascript";
        jsElm.src = url;
        document.body.appendChild(jsElm);
    }

    loadData() {
        this.loadStylesheet(getApiPath() + "/dashboard/theme");
        
        fetchGet("/dashboard", function(json) {

            var dashboard = json.dashboard;

            document.title = dashboard.title;

            if (dashboard.stylesheets)
                dashboard.stylesheets.map(this.loadStylesheet.bind(this));

            if (dashboard.scripts)
                dashboard.scripts.map(this.loadJavascript.bind(this));

            if (dashboard.geolocation) {
                this.getLocation();
            }

            this.connectWebSocket();

            this.setState({
                dashboard: dashboard,
                loading: false,
                sessionId:  json.sessionId,
                authenticated: json.authenticated
            });

        }.bind(this), this.props.history);
    }

    getLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(position) {
                var name = "location";

                var positionJson = {
                    coords: {
                        accuracy: position.coords.accuracy,
                        altitude: position.coords.altitude,
                        altitudeAccuracy: position.coords.altitudeAccuracy,
                        heading: position.coords.heading,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        speed: position.coords.speed
                    },
                    timestamp: new Date(position.timestamp).toJSON()
                }

                var value = JSON.stringify(positionJson);
                value = btoa(value);
                document.cookie = name + "=" + (value || "") + "; path=/";

                this.setState({
                    location: value
                })
            }.bind(this));
        } 
    }

    redirectToHomePage() {
        if (this.state.dashboard.pages[0].url != null && this.state.dashboard.pages[0].url.indexOf(":") === -1) {
            var url = this.state.dashboard.pages[0].url;
            if (url.indexOf("/") !== 0) {
                url = "/" + url
            }

            return <Redirect to={url}/>
        }
        else if (this.state.dashboard.pages[0].name == null) {
            return <ErrorCard message="Your first page needs to be a static page or a dynamic page without a variable in the URL." />
        }
        else {
            return <Redirect to={`/${this.state.dashboard.pages[0].name.replace(/ /g, "-")}`}/>
        }
    }

    render() {
        if (this.state.hasError) {
            return <ErrorCard message={this.state.error.message} location={this.state.error.stackTrace} />
        }

        if (this.state.loading) {
            return <Loading />
        }

        var dynamicPages = this.state.dashboard.pages.map(function(x) {
            if (x.url === null) return null;

            return <Route path={x.url} render={props => (
                <UdPage id={x.id} dynamic={true} {...props} autoRefresh={x.autoRefresh} refreshInterval={x.refreshInterval}/>
            )} />
        })

        var staticPages = this.state.dashboard.pages.map(function(x) {
            if (x.url !== null) return null;

            return <Route path={'/' + x.name.replace(/ /g, "-")} render={props => (
                <UdPage dynamic={false} {...x} {...props} autoRefresh={x.autoRefresh} refreshInterval={x.refreshInterval}/>
            )} />
        })

        return [
                <UdNavbar backgroundColor={this.state.dashboard.navBarColor} 
                        fontColor={this.state.dashboard.navBarFontColor} 
                        text={this.state.dashboard.title} 
                        links={this.state.dashboard.navbarLinks}
                        logo={this.state.dashboard.navBarLogo}
                        pages={this.state.dashboard.pages}
                        togglePaused={this.togglePausePageCycle.bind(this)} 
                        showPauseToggle={this.state.dashboard.cyclePages}
                        history={this.props.history}
                        authenticated={this.state.authenticated}
                        />,
                <main style={{background: this.state.dashboard.backgroundColor, color: this.state.dashboard.fontColor}}>
                    {staticPages}
                    {dynamicPages}
                    <Route exact path="/" render={this.redirectToHomePage.bind(this)}/>
                </main>,
                <UdModal />,
                <UdFooter backgroundColor={this.state.dashboard.navBarColor} fontColor={this.state.dashboard.navBarFontColor} footer={this.state.dashboard.footer} demo={this.state.dashboard.demo} />,
                <Route path="/" render={function (x) {
                    return <PageCycler history={x.history} pages={this.state.dashboard.pages} cyclePages={this.state.dashboard.cyclePages && !this.state.pausePageCycle} cyclePagesInterval={this.state.dashboard.cyclePagesInterval} />;
                    }.bind(this)}/>
                ]
    }
}