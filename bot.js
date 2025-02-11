/**
 * Project Name: Sumbul (Attendance Tracker Bot)
 * Code By: Md Mahfuz RP
 * © 2025 All Rights Reserved by @mdmahfuzrp
 */

require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const cron = require("node-cron");
const moment = require("moment-timezone");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Waiting for the scheduled task...");

  const cronTime = process.env.ATTENDANCE_CRON || "10 11 * * *";
  const pollDuration = parseInt(process.env.COLLECTOR_TIME) || 600000;

  console.log(`Cron Job Repeat Time: ${cronTime}`);
  console.log(`Poll Open Duration: ${pollDuration / 60000} minutes`);

  // List of excluded user IDs
  const excludedUsers = [
    "bristymarjia",
    "mdmahfuzrp",
    "charliecres",
    "snpsujon",
  ];

  // Schedule poll every day with cron
  cron.schedule(
    process.env.ATTENDANCE_CRON || "10 11 * * *",
    async () => {
      console.log("Running daily attendance poll...");

      const attendanceChannel = await client.channels.fetch(
        process.env.ATTENDANCE_CHANNEL_ID
      );
      if (!attendanceChannel)
        return console.error("Attendance channel not found!");

      // Fetch all members in the channel
      const guild = attendanceChannel.guild;
      await guild.members.fetch();
      const allMembers = guild.members.cache.filter(
        (member) =>
          !member.user.bot && !excludedUsers.includes(member.user.username)
      );

      // Create the initial "Mark Present" button
      const presentButton = new ButtonBuilder()
        .setCustomId("mark_present")
        .setLabel("✅ Mark Present")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(presentButton);
      const date = moment().tz("Asia/Dhaka").format("DD/MM/YYYY");

      // Send the poll message
      const pollMessage = await attendanceChannel.send({
        content: `📢 **${date}: Daily Attendance**\nClick the button below to mark yourself as **Present**.`,
        components: [row],
      });

      // Store user interactions
      const attendanceList = new Map();

      // Create a collector for button clicks
      const collector = pollMessage.createMessageComponentCollector({
        time: parseInt(process.env.COLLECTOR_TIME) || 600000,
      });

      collector.on("collect", async (interaction) => {
        if (interaction.customId === "mark_present") {
          if (attendanceList.has(interaction.user.id)) {
            await interaction.reply({
              content: "⚠️ You have already marked your attendance!",
              ephemeral: true,
            });
            return;
          }

          const time = moment().tz("Asia/Dhaka").format("hh:mm:ss A");
          const realName =
            interaction.member?.displayName || interaction.user.username;

          attendanceList.set(interaction.user.id, {
            name: realName,
            time,
          });

          // Disable the button for the user only
          const disabledButton = new ButtonBuilder()
            .setCustomId("marked")
            .setLabel("✅ Marked")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);

          const rowForUser = new ActionRowBuilder().addComponents(
            disabledButton
          );

          // Update only the user's button
          await interaction.reply({
            content: `✅ You marked yourself present at **${time}**!`,
            ephemeral: true, // Only the user sees this message
            components: [rowForUser],
          });
        }
      });

      // Disable the button for everyone and update text to "Time's Up!"
      collector.on("end", async (interaction) => {
        const reportChannel = await client.channels.fetch(
          process.env.REPORT_CHANNEL_ID
        );
        if (!reportChannel) return console.error("Report channel not found!");

        // Get today's date in DD/MM/YYYY format
        const date = moment().tz("Asia/Dhaka").format("DD/MM/YYYY");

        // Update the button text and disable it for everyone
        const timesUpButton = new ButtonBuilder()
          .setCustomId("times_up")
          .setLabel("⏳ Time's Up!")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);

        await pollMessage.edit({
          content: `📢 **${date}: Daily Attendance (Closed)**\nThe attendance marking is now closed.`,
          components: [new ActionRowBuilder().addComponents(timesUpButton)],
        });

        // Generate attendance report for the report channel
        let presentReport = `📢 **${date}: Daily Attendance Report**\n\n📢 **Present List**\n`;
        let absentReport = "📢 **Absent List**\n";

        if (attendanceList.size === 0) {
          presentReport += "No one marked themselves as present today. ❌";
        } else {
          attendanceList.forEach(({ time, name }) => {
            presentReport += `✅ ${name} - Marked at **${time}**\n`;
          });
        }

        // Get absent members
        const presentUserIds = new Set(attendanceList.keys());
        const absentMembers = allMembers.filter(
          (member) => !presentUserIds.has(member.user.id)
        );

        if (absentMembers.size === 0) {
          absentReport += "🎉 Everyone marked their attendance today!";
        } else {
          absentMembers.forEach((member) => {
            absentReport += `❌ ${
              member.displayName || member.user.username
            }\n`;
          });
        }

        // Send combined report to the report channel
        await reportChannel.send(`${presentReport}\n${absentReport}`);

        // Send the absent list to the attendance channel
        await attendanceChannel.send(absentReport);
      });
    },
    {
      timezone: "Asia/Dhaka",
    }
  );
});

client.login(process.env.DISCORD_TOKEN);
