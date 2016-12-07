module.exports.getPlugin = function (plugin) {
    if (!plugin)
        return false;

    for (var n = 0; n < global.server.plugins.length; n++) {
        let pl = global.server.plugins[n];

        if (pl.name.toLowerCase() === plugin.toLowerCase())
            return pl;
    }
    return false;
};