include $(TOPDIR)/rules.mk

PKG_NAME:=wan-observer
PKG_VERSION:=0.1.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/wan-observer
  SECTION:=net
  CATEGORY:=Network
  TITLE:=WAN Observer measurement history
  URL:=https://github.com/ddedic/openwrt-wan-observer
  DEPENDS:=+jq
  PKGARCH:=all
endef

define Package/wan-observer/description
  Import existing internet-performance measurements into bounded private history
  and export privacy-minimizing CSV. No automatic network tests or web UI yet.
endef

define Build/Prepare
endef
define Build/Configure
endef
define Build/Compile
endef

define Package/wan-observer/install
	$(INSTALL_DIR) $(1)/usr/bin $(1)/usr/share/wan-observer
	$(INSTALL_BIN) ./files/wan-observer $(1)/usr/bin/wan-observer
	$(INSTALL_DATA) ./files/record.jq $(1)/usr/share/wan-observer/record.jq
endef

$(eval $(call BuildPackage,wan-observer))
