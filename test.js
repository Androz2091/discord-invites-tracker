const Discord = require('discord.js');
const client = new Discord.Client();

const InvitesTracker = require('./');
const tracker = InvitesTracker.init(client, {
    fetchGuilds: true,
    fetchVanity: true,
    fetchAuditLogs: true
});

tracker.on('guildMemberAdd', (member, invite, type) => {

    // if no invite was found
    if (!invite) return;

    // send welcome message
    const welcomeChannel = member.guild.channels.cache.find((ch) => ch.name === 'welcome');
    welcomeChannel.send(`Welcome ${member}! You were invited by ${invite.inviter.username}!`);

});

client.login(process.env.TOKEN);
