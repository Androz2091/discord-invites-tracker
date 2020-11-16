"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var events_1 = require("events");
var discord_js_1 = require("discord.js");
;
/**
 * Compare le cache et les données en direct pour trouver quelle invitation a été utilisée.
 * @param cachedInvites Les invitations en cache du serveur. Celles-ci sont forcément bonnes et correspondent exactement à l'état des invitations juste avant l'arrivée du membre.
 * @param currentInvites Les invitations du serveur. Celles-ci sont les invitations qui sont actuellement sur le serveur.
 * @returns Les invitations qui pourraient convenir, classées de la plus probable à la moins probable.
 */
var compareInvitesCache = function (cachedInvites, currentInvites) {
    var invitesUsed = [];
    currentInvites.forEach(function (invite) {
        if (
        // L'invitation doit forcément avoir été utilisée une fois
        invite.uses !== 0
            // L'invitation doit être dans le cache (sinon impossible de comparer les utilisations)
            && cachedInvites.get(invite.code)
            // L'invitation doit avoir été utilisée au moins une fois
            && cachedInvites.get(invite.code).uses < invite.uses) {
            invitesUsed.push(invite);
        }
    });
    // Cas de figure particulier : l'invitation utilisée a été supprimée juste après l'arrivée du membre et juste
    // avant l'émission de GUILD_MEMBER_ADD. (une invitation avec un nombre d'utilisation limitée fonctionne comme ça)
    if (invitesUsed.length < 1) {
        // Triage du cache pour que les invitations supprimées le plus récemment soient en premier
        // (logiquement une invitation supprimée il y a 0.01s a plus de chance d'être une invitation que le membre a utilisé qu'une invitation supprimée il y a 3 jours)
        cachedInvites.sort(function (a, b) { return (a.deletedTimestamp && b.deletedTimestamp) ? b.deletedTimestamp - a.deletedTimestamp : 0; }).forEach(function (invite) {
            if (
            // Si l'invitation n'est plus présente
            !currentInvites.get(invite.code)
                // Si l'invitation était bien une invitation a un nombre d'utilisation limitée
                && invite.maxUses > 0
                // Et si l'invitation était sur le point d'atteindre le nombre d'utilisations max
                && invite.uses === (invite.maxUses - 1)) {
                invitesUsed.push(invite);
            }
        });
    }
    return invitesUsed;
};
var InvitesTracker = /** @class */ (function (_super) {
    __extends(InvitesTracker, _super);
    function InvitesTracker(client, options) {
        var _this = _super.call(this) || this;
        _this.client = client;
        _this.options = options;
        _this.invitesCache = new discord_js_1.Collection();
        _this.invitesCacheUpdates = new discord_js_1.Collection();
        _this.cacheFetched = false;
        _this.vanityInvitesCache = new discord_js_1.Collection();
        if (_this.options.fetchGuilds) {
            if (_this.client.readyAt) {
                _this.fetchCache().then(function () {
                    _this.cacheFetched = true;
                    _this.emit('cacheFetched');
                });
            }
            else {
                _this.client.on('ready', function () {
                    _this.fetchCache().then(function () {
                        _this.cacheFetched = true;
                        _this.emit('cacheFetched');
                    });
                });
            }
        }
        _this.client.on('guildMemberAdd', function (member) { return _this.handleGuildMemberAdd(member); });
        _this.client.on('inviteCreate', function (invite) { return _this.handleInviteCreate(invite); });
        _this.client.on('inviteDelete', function (invite) { return _this.handleInviteDelete(invite); });
        return _this;
    }
    Object.defineProperty(InvitesTracker.prototype, "guilds", {
        get: function () {
            var _this = this;
            var guilds = this.client.guilds.cache;
            if (this.options.exemptGuild)
                guilds = guilds.filter(function (g) { return !_this.options.exemptGuild(g); });
            if (this.options.activeGuilds)
                guilds = guilds.filter(function (g) { return _this.options.activeGuilds.includes(g.id); });
            return guilds;
        },
        enumerable: false,
        configurable: true
    });
    InvitesTracker.prototype.handleInviteCreate = function (invite) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.options.fetchGuilds) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.fetchGuildCache(invite.guild, true)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        // Ensuite, ajouter l'invitation au cache du serveur
                        if (this.invitesCache.get(invite.guild.id)) {
                            this.invitesCache.get(invite.guild.id).set(invite.code, invite);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    InvitesTracker.prototype.handleInviteDelete = function (invite) {
        return __awaiter(this, void 0, void 0, function () {
            var cachedInvites;
            return __generator(this, function (_a) {
                cachedInvites = this.invitesCache.get(invite.guild.id);
                // Si le cache pour ce serveur existe et si l'invitation existe bien dans le cache de ce serveur
                if (cachedInvites && cachedInvites.get(invite.code)) {
                    cachedInvites.get(invite.code).deletedTimestamp = Date.now();
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Emit quand un membre rejoint un serveur.
     * @param member Le membre qui a rejoint.
     */
    InvitesTracker.prototype.handleGuildMemberAdd = function (member) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var currentInvites, cachedInvites, usedInvites, isVanity, vanityInvite, vanityInviteCache;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (member.partial)
                            return [2 /*return*/];
                        if (!this.guilds.has(member.guild.id))
                            return [2 /*return*/];
                        return [4 /*yield*/, member.guild.fetchInvites().catch(function () { })];
                    case 1:
                        currentInvites = _b.sent();
                        if (!currentInvites) {
                            // Si les invitations n'ont pas pu être récupérées
                            this.emit('guildMemberAdd', member, 'permissions', null);
                            return [2 /*return*/];
                        }
                        cachedInvites = this.invitesCache.get(member.guild.id);
                        // Mise à jour du cache
                        this.invitesCache.set(member.guild.id, currentInvites);
                        this.invitesCacheUpdates.set(member.guild.id, Date.now());
                        // Si il n'y avait pas de données en cache, on ne peut tout simplement pas déterminer l'invitation utilisée
                        if (!cachedInvites) {
                            this.emit('guildMemberAdd', member, 'unknown', null);
                            return [2 /*return*/];
                        }
                        usedInvites = compareInvitesCache(cachedInvites, currentInvites);
                        isVanity = false;
                        if (!(usedInvites.length === 0 && !member.guild.features.includes('VANITY_URL'))) return [3 /*break*/, 3];
                        return [4 /*yield*/, member.guild.fetchVanityData()];
                    case 2:
                        vanityInvite = _b.sent();
                        vanityInviteCache = this.vanityInvitesCache.get(member.guild.id);
                        // On met à jour le cache
                        this.vanityInvitesCache.set(member.guild.id, vanityInvite);
                        if (vanityInviteCache) {
                            // Si le nombre d'utilisation a augmenté
                            if (vanityInviteCache.uses < vanityInvite.uses)
                                isVanity = true;
                        }
                        _b.label = 3;
                    case 3:
                        this.emit('guildMemberAdd', member, isVanity ? 'vanity' : usedInvites[0] ? 'normal' : 'unknown', (_a = usedInvites[0]) !== null && _a !== void 0 ? _a : null);
                        return [2 /*return*/];
                }
            });
        });
    };
    InvitesTracker.prototype.fetchGuildCache = function (guild, useCache) {
        var _this = this;
        if (useCache === void 0) { useCache = false; }
        return new Promise(function (resolve) {
            if (_this.invitesCache.has(guild.id) && useCache)
                resolve();
            if (guild.me.hasPermission('MANAGE_GUILD')) {
                guild.fetchInvites().then(function (invites) {
                    _this.invitesCache.set(guild.id, invites);
                    _this.invitesCacheUpdates.set(guild.id, Date.now());
                    resolve();
                }).catch(function () { return resolve(); });
            }
            else
                resolve();
        });
    };
    InvitesTracker.prototype.fetchCache = function () {
        return __awaiter(this, void 0, void 0, function () {
            var fetchGuildCachePromises;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fetchGuildCachePromises = this.guilds.array().map(function (guild) { return _this.fetchGuildCache(guild); });
                        return [4 /*yield*/, Promise.all(fetchGuildCachePromises)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return InvitesTracker;
}(events_1.EventEmitter));
var init = function (client, options) { return new InvitesTracker(client, options); };
module.exports = {
    init: init
};
